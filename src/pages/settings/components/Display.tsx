// ck-pluely v2: text size, which screen the floating bar uses, update check.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Header } from "@/components";

const SCALES = [90, 100, 115, 130];

interface UpdateInfo {
  version: string;
  url: string;
  newer: boolean;
}

export const Display = () => {
  const [scale, setScale] = useState(() => Number(localStorage.getItem("ck_font_scale") || "100"));
  const [screens, setScreens] = useState(1);
  const [screenMsg, setScreenMsg] = useState("");
  const [upd, setUpd] = useState<UpdateInfo | null>(null);
  const [updMsg, setUpdMsg] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    invoke<number>("ck_screen_count").then(setScreens).catch(() => {});
  }, []);

  const pickScale = (v: number) => {
    setScale(v);
    localStorage.setItem("ck_font_scale", String(v));
    window.dispatchEvent(new Event("ck-font-scale"));
  };

  const move = async (target: string) => {
    try {
      const name = await invoke<string>("ck_move_bar_to_screen", { target });
      setScreenMsg(`悬浮条已移到 ${name}`);
    } catch (e) {
      setScreenMsg(String(e));
    }
  };

  const check = async () => {
    setChecking(true);
    setUpdMsg("");
    try {
      const u = await invoke<UpdateInfo>("ck_check_update");
      setUpd(u);
      if (!u.newer) setUpdMsg(`已是最新版本（${u.version}）`);
    } catch (e) {
      setUpdMsg(String(e));
    }
    setChecking(false);
  };

  const seg = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div id="display" className="space-y-4">
      <Header title="显示" description="字号对所有窗口生效。" isMainTitle />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px]">字号</span>
        <div role="radiogroup" aria-label="字号" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {SCALES.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={scale === v} className={seg(scale === v)} onClick={() => pickScale(v)}>
              {v === 100 ? "标准" : v < 100 ? "小" : v === 115 ? "大" : "特大"}
            </button>
          ))}
        </div>
      </div>
      {screens > 1 ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">悬浮条所在屏幕（共 {screens} 块）</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => move("cursor")}>鼠标所在屏</Button>
              <Button variant="outline" size="sm" onClick={() => move("primary")}>主屏</Button>
              <Button variant="outline" size="sm" onClick={() => move("next")}>下一块</Button>
            </div>
          </div>
          {screenMsg ? <p className="text-[11px] text-muted-foreground" aria-live="polite">{screenMsg}</p> : null}
          <p className="text-[11px] text-muted-foreground">投影时可把悬浮条放在只有你能看到的那块屏幕上。</p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px]">版本更新</span>
        <div className="flex items-center gap-2">
          {updMsg ? <span className="text-[12px] text-muted-foreground" aria-live="polite">{updMsg}</span> : null}
          {upd?.newer ? (
            <Button size="sm" onClick={() => openUrl(upd.url).catch(() => {})}>
              下载 {upd.version}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={check} disabled={checking}>
              {checking ? "正在检查" : "检查更新"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
