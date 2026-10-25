import type { FallbackProps } from "react-error-boundary";

/** 任何组件出错时显示的兜底界面，避免整窗空白 */
export const RootErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 rounded-xl border bg-background p-6 text-center text-foreground">
    <div className="text-sm font-semibold">界面出了点问题，已自动拦截</div>
    <div className="max-w-[90%] break-all text-xs text-muted-foreground">
      {error instanceof Error ? error.message : String(error)}
    </div>
    <div className="flex gap-2">
      <button type="button" className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground" onClick={resetErrorBoundary}>
        重试
      </button>
      <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => window.location.reload()}>
        重新加载
      </button>
    </div>
  </div>
);
