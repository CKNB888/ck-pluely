import { invoke } from "@tauri-apps/api/core";

export type UiStyle = "panel" | "bar";
export const UI_STYLE_KEY = "ck_ui_style";
export const BAR_POS_KEY = "ck_bar_pos";
export const REPO_URL = "https://github.com/CKNB888/ck-pluely";

export const getUiStyle = (): UiStyle =>
  localStorage.getItem(UI_STYLE_KEY) === "bar" ? "bar" : "panel";

export const setUiStyle = async (style: UiStyle) => {
  localStorage.setItem(UI_STYLE_KEY, style);
  try {
    await invoke("ck_set_ui_style", { style });
  } catch {
    /* 非 Tauri 环境（测试）忽略 */
  }
};

/** 把 provider id 转成人能读的名称，例如 groq → Groq，openai-compatible → OpenAI Compatible */
export const providerLabel = (id?: string) => {
  if (!id) return "未设置";
  const known: Record<string, string> = {
    openai: "OpenAI",
    groq: "Groq",
    claude: "Claude",
    anthropic: "Anthropic",
    gemini: "Gemini",
    ollama: "Ollama",
    openrouter: "OpenRouter",
    deepseek: "DeepSeek",
    "groq-whisper": "Groq Whisper",
    "openai-whisper": "OpenAI Whisper",
  };
  if (known[id]) return known[id];
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
};

export const relativeTime = (ts: number, now = Date.now()) => {
  const d = Math.max(0, now - ts) / 1000;
  if (d < 60) return "刚刚";
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} 天前`;
  const t = new Date(ts);
  return `${t.getMonth() + 1}月${t.getDate()}日`;
};

/** ck-pluely v2.1.1: page the dashboard should open next (set by the menu-bar panel). */
export const PENDING_NAV_KEY = "ck_pending_nav";
