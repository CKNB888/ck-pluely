import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { ChevronRightIcon } from "lucide-react";
import { useApp } from "@/contexts";
import { getUiStyle, providerLabel } from "@/lib/ui-style";
import { getPlatform } from "@/lib/platform";

const Item = ({
  label,
  value,
  action,
  onClick,
}: {
  label: string;
  value: string;
  action: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/50"
  >
    <span className="min-w-0">
      <span className="block text-[13px] font-medium">{label}</span>
      <span className="block truncate text-[12px] text-muted-foreground">{value}</span>
    </span>
    <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
      {action}
      <ChevronRightIcon className="size-3.5" />
    </span>
  </button>
);

export const Overview = () => {
  const { selectedAIProvider, selectedSttProvider } = useApp();
  const navigate = useNavigate();
  const [listening, setListening] = useState(false);
  const style = getUiStyle();
  const where = getPlatform() === "macos" ? "菜单栏" : "任务栏托盘";

  useEffect(() => {
    invoke<boolean>("get_capture_status").then(setListening).catch(() => {});
  }, []);

  const model = selectedAIProvider?.variables?.model;

  return (
    <section className="overflow-hidden rounded-lg border bg-card divide-y">
      <Item
        label="界面"
        value={style === "panel" ? `菜单栏面板：点击${where}图标打开` : "悬浮条：可拖到任意位置"}
        action="更改"
        onClick={() => navigate("/settings")}
      />
      <Item
        label="对话模型"
        value={`${providerLabel(selectedAIProvider?.provider)}${model ? ` · ${model}` : ""}`}
        action="配置"
        onClick={() => navigate("/dev-space")}
      />
      <Item
        label="语音识别"
        value={providerLabel(selectedSttProvider?.provider)}
        action="配置"
        onClick={() => navigate("/dev-space")}
      />
      <Item
        label="会议转写"
        value={listening ? "正在收听" : "未开启"}
        action={listening ? "打开面板" : "开始"}
        onClick={() =>
          invoke(listening ? "ck_toggle_panel" : "ck_panel_action", listening ? {} : { action: "system_audio" }).catch(() => {})
        }
      />
    </section>
  );
};
