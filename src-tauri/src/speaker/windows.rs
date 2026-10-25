// Pluely windows speaker input and stream
use super::AudioDevice;
use anyhow::Result;
use futures_util::Stream;
use std::collections::VecDeque;
use std::sync::{mpsc, Arc, Mutex};
use std::task::{Poll, Waker};
use std::thread;
use std::time::Duration;
use tracing::error;
use wasapi::{get_default_device, DeviceCollection, Direction, SampleType, StreamMode, WaveFormat};

pub fn get_input_devices() -> Result<Vec<AudioDevice>> {
    let mut devices = Vec::new();

    let default_device = get_default_device(&Direction::Capture).ok();
    let default_id = default_device.as_ref().and_then(|d| d.get_id().ok());

    let collection = DeviceCollection::new(&Direction::Capture)?;
    let count = collection.get_nbr_devices()?;

    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            let name = device
                .get_friendlyname()
                .unwrap_or_else(|_| format!("Microphone {}", i));
            let id = device
                .get_id()
                .unwrap_or_else(|_| format!("windows_input_{}", i));
            let is_default = default_id.as_ref().map(|def| def == &id).unwrap_or(false);

            devices.push(AudioDevice {
                id,
                name,
                is_default,
            });
        }
    }

    Ok(devices)
}

pub fn get_output_devices() -> Result<Vec<AudioDevice>> {
    let mut devices = Vec::new();

    let default_device = get_default_device(&Direction::Render).ok();
    let default_id = default_device.as_ref().and_then(|d| d.get_id().ok());

    let collection = DeviceCollection::new(&Direction::Render)?;
    let count = collection.get_nbr_devices()?;

    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            let name = device
                .get_friendlyname()
                .unwrap_or_else(|_| format!("Speaker {}", i));
            let id = device
                .get_id()
                .unwrap_or_else(|_| format!("windows_output_{}", i));
            let is_default = default_id.as_ref().map(|def| def == &id).unwrap_or(false);

            devices.push(AudioDevice {
                id,
                name,
                is_default,
            });
        }
    }

    Ok(devices)
}

fn find_device_by_id(direction: &Direction, device_id: &str) -> Option<wasapi::Device> {
    let collection = match DeviceCollection::new(direction) {
        Ok(c) => c,
        Err(e) => {
            error!(
                "[find_device_by_id] Failed to create device collection: {}",
                e
            );
            return None;
        }
    };

    let count = match collection.get_nbr_devices() {
        Ok(c) => c,
        Err(e) => {
            error!("[find_device_by_id] Failed to get device count: {}", e);
            return None;
        }
    };

    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            if let Ok(id) = device.get_id() {
                if id == device_id {
                    return Some(device);
                }
            }
        }
    }

    error!(
        "[find_device_by_id] No matching device found for ID: {}",
        device_id
    );
    None
}

pub struct SpeakerInput {
    device_id: Option<String>,
}

impl SpeakerInput {
    pub fn new(device_id: Option<String>) -> Result<Self> {
        // Store the device_id for later use in stream()
        let device_id = device_id.filter(|id| !id.is_empty() && id != "default");
        Ok(Self { device_id })
    }

    // Starts the audio stream
    pub fn stream(self) -> SpeakerStream {
        let sample_queue = Arc::new(Mutex::new(VecDeque::new()));
        let waker_state = Arc::new(Mutex::new(WakerState {
            waker: None,
            has_data: false,
            shutdown: false,
        }));
        let (init_tx, init_rx) = mpsc::channel();

        let queue_clone = sample_queue.clone();
        let waker_clone = waker_state.clone();
        let device_id = self.device_id;

        let capture_thread = thread::spawn(move || {
            if let Err(e) =
                SpeakerStream::capture_audio_loop(queue_clone, waker_clone, init_tx, device_id)
            {
                error!("Pluely Audio capture loop failed: {}", e);
            }
        });

        let actual_sample_rate = match init_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(rate)) => rate,
            Ok(Err(e)) => {
                error!("Pluely Audio initialization failed: {}", e);
                44100
            }
            Err(_) => {
                error!("Pluely Audio initialization timeout");
                44100
            }
        };

        SpeakerStream {
            sample_queue,
            waker_state,
            capture_thread: Some(capture_thread),
            actual_sample_rate,
        }
    }
}

struct WakerState {
    waker: Option<Waker>,
    has_data: bool,
    shutdown: bool,
}

pub struct SpeakerStream {
    sample_queue: Arc<Mutex<VecDeque<f32>>>,
    waker_state: Arc<Mutex<WakerState>>,
    capture_thread: Option<thread::JoinHandle<()>>,
    actual_sample_rate: u32,
}

impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        self.actual_sample_rate
    }

    fn capture_audio_loop(
        sample_queue: Arc<Mutex<VecDeque<f32>>>,
        waker_state: Arc<Mutex<WakerState>>,
        init_tx: mpsc::Sender<Result<u32>>,
        device_id: Option<String>,
    ) -> Result<()> {
        // 识别到会议软件时只录它的声音（进程环回，Windows 10 2004+，含子进程）；
        // 不支持或失败时退回整机系统声音
        let process_result = (|| -> Result<_> {
            let d = crate::meeting::current().ok_or_else(|| anyhow::anyhow!("no meeting app"))?;
            let pid = *d.pids.first().ok_or_else(|| anyhow::anyhow!("no pid"))?;
            let mut audio_client = wasapi::AudioClient::new_application_loopback_client(pid, true)
                .map_err(|e| anyhow::anyhow!("process loopback: {e}"))?;
            let rate = 48000u32;
            let format = WaveFormat::new(32, 32, &SampleType::Float, rate as usize, 1, None);
            let mode = StreamMode::EventsShared {
                autoconvert: true,
                buffer_duration_hns: 200_000,
            };
            audio_client.initialize_client(&format, &Direction::Capture, &mode)?;
            let h_event = audio_client.set_get_eventhandle()?;
            let capture_client = audio_client.get_audiocaptureclient()?;
            audio_client.start_stream()?;
            crate::startup::log(&format!("{}: process loopback pid {pid}", d.name));
            Ok((h_event, capture_client, rate))
        })();
        if let Err(e) = &process_result {
            crate::startup::log(&format!(
                "process loopback unavailable ({e}), using system audio"
            ));
        }
        crate::meeting::set_mode(if process_result.is_ok() {
            "process"
        } else {
            "system"
        });
        let init_result = process_result.or_else(|_| (|| -> Result<_> {
            let device = match device_id {
                Some(ref id) => match find_device_by_id(&Direction::Render, id) {
                    Some(d) => d,
                    None => {
                        get_default_device(&Direction::Render).map_err(|e| anyhow::anyhow!("未找到默认播放设备，请在系统声音设置中选择扬声器或耳机 / No default render device: {e}"))?
                    }
                },
                None => get_default_device(&Direction::Render)?,
            };

            let mut audio_client = device.get_iaudioclient()?;

            let device_format = audio_client.get_mixformat()?;
            let actual_rate = device_format.get_samplespersec();

            let desired_format =
                WaveFormat::new(32, 32, &SampleType::Float, actual_rate as usize, 1, None);

            let (_def_time, min_time) = audio_client.get_device_period()?;

            let mode = StreamMode::EventsShared {
                autoconvert: true,
                buffer_duration_hns: min_time,
            };

            audio_client.initialize_client(&desired_format, &Direction::Capture, &mode)?;

            let h_event = audio_client.set_get_eventhandle()?;
            let render_client = audio_client.get_audiocaptureclient()?;

            audio_client.start_stream()?;

            Ok((h_event, render_client, actual_rate))
        })());

        match init_result {
            Ok((h_event, render_client, sample_rate)) => {
                let _ = init_tx.send(Ok(sample_rate));

                // 回环采集在没有声音播放时不会触发事件：等待超时只说明“静音”，
                // 不能当作故障退出（否则会议中 3 秒没人说话就停止采集）。
                // 连续读取失败（如设备被拔出 / 失效）才结束，并唤醒消费者让上层感知。
                let mut read_failures = 0u32;
                loop {
                    {
                        let state = waker_state.lock().unwrap_or_else(|e| e.into_inner());
                        if state.shutdown {
                            break;
                        }
                    }

                    if h_event.wait_for_event(1000).is_err() {
                        continue;
                    }

                    let mut temp_queue = VecDeque::new();
                    if let Err(e) = render_client.read_from_device_to_deque(&mut temp_queue) {
                        read_failures += 1;
                        error!("Pluely Failed to read audio data: {}", e);
                        if read_failures >= 20 {
                            error!("audio device unavailable, stopping capture");
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(50));
                        continue;
                    }
                    read_failures = 0;

                    if temp_queue.is_empty() {
                        continue;
                    }

                    let mut samples = Vec::new();
                    let bytes = temp_queue.make_contiguous();
                    samples.reserve(bytes.len() / 4);
                    for b in bytes.as_chunks::<4>().0 {
                        samples.push(f32::from_le_bytes(*b));
                    }

                    if !samples.is_empty() {
                        // Consistent buffer overflow handling
                        let dropped = {
                            let mut queue = sample_queue.lock().unwrap_or_else(|e| e.into_inner());
                            let max_buffer_size = 131072; // 128KB buffer (matching macOS)

                            queue.extend(samples.iter());

                            // If buffer exceeds maximum, drop oldest samples
                            let dropped_count = if queue.len() > max_buffer_size {
                                let to_drop = queue.len() - max_buffer_size;
                                queue.drain(0..to_drop);
                                to_drop
                            } else {
                                0
                            };

                            dropped_count
                        };

                        if dropped > 0 {
                            error!("Windows buffer overflow - dropped {} samples", dropped);
                        }

                        // Wake up consumer
                        {
                            let mut state = waker_state.lock().unwrap_or_else(|e| e.into_inner());
                            if !state.has_data {
                                state.has_data = true;
                                if let Some(waker) = state.waker.take() {
                                    drop(state);
                                    waker.wake();
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = init_tx.send(Err(e));
                return Ok(());
            }
        }

        // 采集线程结束：标记关闭并唤醒消费者，流随之结束而不是永远挂起
        {
            let mut state = waker_state.lock().unwrap_or_else(|e| e.into_inner());
            state.shutdown = true;
            if let Some(waker) = state.waker.take() {
                drop(state);
                waker.wake();
            }
        }

        Ok(())
    }
}

// Drops the audio stream
impl Drop for SpeakerStream {
    fn drop(&mut self) {
        {
            let mut state = self.waker_state.lock().unwrap_or_else(|e| e.into_inner());
            state.shutdown = true;
        }

        if let Some(thread) = self.capture_thread.take() {
            if let Err(e) = thread.join() {
                error!("Failed to join capture thread: {:?}", e);
            }
        }
    }
}

// Stream of f32 audio samples from the speaker
impl Stream for SpeakerStream {
    type Item = f32;

    // Polls the audio stream
    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        {
            let state = self.waker_state.lock().unwrap_or_else(|e| e.into_inner());
            if state.shutdown {
                return Poll::Ready(None);
            }
        }

        {
            let mut queue = self.sample_queue.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(sample) = queue.pop_front() {
                return Poll::Ready(Some(sample));
            }
        }

        {
            let mut state = self.waker_state.lock().unwrap_or_else(|e| e.into_inner());
            if state.shutdown {
                return Poll::Ready(None);
            }
            state.has_data = false;
            state.waker = Some(cx.waker().clone());
            drop(state);
        }

        {
            let mut queue = self.sample_queue.lock().unwrap_or_else(|e| e.into_inner());
            match queue.pop_front() {
                Some(sample) => Poll::Ready(Some(sample)),
                None => Poll::Pending,
            }
        }
    }
}
