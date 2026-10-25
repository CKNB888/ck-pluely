import { useEffect, useState } from "react";
import { getSessionUsage, onSessionUsage, resetSessionUsage, SessionUsage } from "@/lib/tokens";
import { t } from "@/i18n";

const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** 本次会话 token 用量（输入 / 输出 / 缓存命中），点击清零。 */
export function TokenUsage({ className = "" }: { className?: string }) {
  const [u, setU] = useState<SessionUsage>(getSessionUsage());
  useEffect(() => {
    const off = onSessionUsage(setU);
    return () => {
      off();
    };
  }, []);
  if (!u.requests) return null;
  const last = u.last;
  const title = [
    t("Session tokens (click to reset)"),
    `${t("Requests")}: ${u.requests}`,
    `${t("Input")}: ${u.input}  ${t("Cached")}: ${u.cached}`,
    `${t("Output")}: ${u.output}`,
    last ? `${t("Last answer")}: ${last.input} → ${last.output}${last.ttftMs ? ` · ${t("first token")} ${Math.round(last.ttftMs)} ms` : ""}` : "",
    u.estimated ? t("Some numbers are estimates (provider sent no usage).") : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button
      type="button"
      title={title}
      onClick={resetSessionUsage}
      className={`text-[10px] tabular-nums text-muted-foreground/80 hover:text-foreground select-none ${className}`}
    >
      {u.estimated ? "≈" : ""}
      {fmt(u.input)}↑ {fmt(u.output)}↓{u.cached ? ` · ${t("cache")} ${fmt(u.cached)}` : ""}
    </button>
  );
}
