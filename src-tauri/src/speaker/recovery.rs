//! Automatic recovery of system-audio capture after sleep/wake, device removal
//! or a default-output change.
//!
//! Each backend ends its stream when the device becomes unusable
//! (WASAPI: AUDCLNT_E_DEVICE_INVALIDATED makes reads fail -> windows.rs ends
//! the stream; PulseAudio: read error -> linux.rs ends; CoreAudio: the
//! aggregate device's IOProc simply stops being called after some wake / route
//! changes, so a stall watchdog is used there). When the default output
//! device changes while we follow "default", WASAPI keeps looping back the old
//! endpoint (Microsoft's guidance is to re-open on IMMNotificationClient
//! OnDefaultDeviceChanged), so we poll the default device id and re-open.
//! `Supervised` turns all of these into a normal end-of-stream plus a
//! reason, and the capture task re-opens the device with back-off.
use futures_util::Stream;
use std::pin::Pin;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndReason {
    /// Backend ended the stream (device lost / invalidated / read errors).
    DeviceLost = 1,
    /// No samples for longer than the stall limit.
    Stalled = 2,
    /// The default output device changed while following "default".
    DefaultChanged = 3,
}

impl EndReason {
    fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(Self::DeviceLost),
            2 => Some(Self::Stalled),
            3 => Some(Self::DefaultChanged),
            _ => None,
        }
    }
}

/// Shared end-reason cell (0 = still running).
#[derive(Clone, Default)]
pub struct EndCell(Arc<AtomicU8>);

impl EndCell {
    pub fn set(&self, r: EndReason) {
        // first reason wins
        let _ = self
            .0
            .compare_exchange(0, r as u8, Ordering::AcqRel, Ordering::Acquire);
    }
    pub fn get(&self) -> Option<EndReason> {
        EndReason::from_u8(self.0.load(Ordering::Acquire))
    }
}

/// Stall limit per platform. WASAPI loopback delivers *no packets* while
/// nothing is playing, so silence is not a stall there -> disabled.
/// CoreAudio aggregate devices and PulseAudio monitor sources tick
/// continuously (zeros when silent).
pub fn stall_limit() -> Option<Duration> {
    if cfg!(target_os = "macos") {
        Some(Duration::from_secs(5))
    } else if cfg!(target_os = "linux") {
        Some(Duration::from_secs(10))
    } else {
        None
    }
}

/// Wraps a sample stream; ends it (returns `None`) on device loss, stall or
/// when `end` is set externally (default-device change).
pub struct Supervised<S> {
    inner: S,
    end: EndCell,
    tick: tokio::time::Interval,
    last_data: Instant,
    stall: Option<Duration>,
}

impl<S> Supervised<S> {
    pub fn new(inner: S, end: EndCell, stall: Option<Duration>) -> Self {
        let mut tick = tokio::time::interval(Duration::from_millis(500));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        Self {
            inner,
            end,
            tick,
            last_data: Instant::now(),
            stall,
        }
    }
}

impl<S: Stream<Item = f32> + Unpin> Stream for Supervised<S> {
    type Item = f32;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<f32>> {
        if self.end.get().is_some() {
            return Poll::Ready(None);
        }
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(s)) => {
                self.last_data = Instant::now();
                Poll::Ready(Some(s))
            }
            Poll::Ready(None) => {
                self.end.set(EndReason::DeviceLost);
                Poll::Ready(None)
            }
            Poll::Pending => {
                // Register a periodic wake-up so external flags / stalls are noticed.
                while self.tick.poll_tick(cx).is_ready() {}
                if self.end.get().is_some() {
                    return Poll::Ready(None);
                }
                if let Some(limit) = self.stall {
                    if self.last_data.elapsed() > limit {
                        self.end.set(EndReason::Stalled);
                        return Poll::Ready(None);
                    }
                }
                Poll::Pending
            }
        }
    }
}

/// Back-off schedule for re-opening (about 40 s in total).
pub const RETRY_DELAYS_MS: &[u64] = &[300, 700, 1500, 2500, 4000, 6000, 8000, 8000, 8000];

/// After this many failed attempts on a specific device, fall back to the
/// system default output.
pub const FALLBACK_TO_DEFAULT_AFTER: usize = 3;

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{stream, StreamExt};

    #[tokio::test]
    async fn ends_with_device_lost_when_inner_ends() {
        let end = EndCell::default();
        let mut s = Supervised::new(stream::iter(vec![0.1f32, 0.2]), end.clone(), None);
        assert_eq!(s.next().await, Some(0.1));
        assert_eq!(s.next().await, Some(0.2));
        assert_eq!(s.next().await, None);
        assert_eq!(end.get(), Some(EndReason::DeviceLost));
    }

    #[tokio::test]
    async fn stall_watchdog_ends_pending_stream() {
        let end = EndCell::default();
        let mut s = Supervised::new(
            stream::pending::<f32>(),
            end.clone(),
            Some(Duration::from_millis(600)),
        );
        let t = Instant::now();
        assert_eq!(s.next().await, None);
        assert!(t.elapsed() >= Duration::from_millis(600));
        assert!(t.elapsed() < Duration::from_secs(3));
        assert_eq!(end.get(), Some(EndReason::Stalled));
    }

    #[tokio::test]
    async fn external_flag_ends_pending_stream_and_first_reason_wins() {
        let end = EndCell::default();
        let mut s = Supervised::new(stream::pending::<f32>(), end.clone(), None);
        let e2 = end.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(200)).await;
            e2.set(EndReason::DefaultChanged);
            e2.set(EndReason::Stalled);
        });
        assert_eq!(s.next().await, None);
        assert_eq!(end.get(), Some(EndReason::DefaultChanged));
    }
}
