import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Header } from "@/components";
import { getUiStyle, setUiStyle, type UiStyle as Style } from "@/lib/ui-style";
import { getPlatform } from "@/lib/platform";

const options: { id: Style; title: string; desc: string }[] = [
  {
    id: "panel",
    title: "菜单栏面板",
    desc: "点菜单栏（Windows 为任务栏托盘）图标弹出面板，常用功能都在里面。",
  },
  {
    id: "bar",
    title: "悬浮条",
    desc: "半透明长条常驻屏幕，可拖到任意位置，位置会被记住。",
  },
];

/** 一个示意小图：面板或长条 */
const Preview = ({ id, active }: { id: Style; active: boolean }) => (
  <div className="relative h-16 w-full overflow-hidden rounded-md border bg-muted">
    <div className="absolute inset-x-0 top-0 h-2 bg-foreground/10" />
    {id === "panel" ? (
      <div
        className={`absolute right-3 top-3 h-11 w-12 rounded-[5px] border bg-card ${
          active ? "border-primary/50" : ""
        }`}
      />
    ) : (
      <div
        className={`absolute left-1/2 top-4 h-3 w-28 -translate-x-1/2 rounded-full border bg-card/80 ${
          active ? "border-primary/50" : ""
        }`}
      />
    )}
  </div>
);

export const UiStyle = () => {
  const [style, setStyle] = useState<Style>(getUiStyle());
  const tray = getPlatform() === "linux" ? "（Linux 托盘图标右键菜单 → 打开面板）" : "";

  const choose = async (id: Style) => {
    setStyle(id);
    await setUiStyle(id);
    invoke("ck_panel_action", { action: id === "bar" ? "show_bar" : "hide_bar" }).catch(() => {});
  };

  return (
    <div id="ui-style" className="space-y-3">
      <Header title="界面样式" description={`选择主界面的形式${tray}`} isMainTitle />
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            aria-pressed={style === o.id}
            className={`flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
              style === o.id ? "border-primary/60 bg-primary/5" : "hover:bg-accent/50"
            }`}
          >
            <Preview id={o.id} active={style === o.id} />
            <span className="text-[13px] font-medium">
              {o.title}
              {o.id === "panel" ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">默认</span> : null}
            </span>
            <span className="text-[12px] leading-relaxed text-muted-foreground">{o.desc}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => invoke("ck_toggle_panel").catch(() => {})}
        className="text-[12px] text-primary hover:underline"
      >
        打开菜单栏面板
      </button>
    </div>
  );
};
