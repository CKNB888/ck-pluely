import { useState } from "react";
import { Switch, Label, Header } from "@/components";
import { t } from "@/i18n";
import { getAutoListen, setAutoListen } from "@/lib/auto-listen";

export const AutoListenToggle = () => {
  const [on, setOn] = useState(getAutoListen());
  return (
    <div id="auto-listen" className="space-y-2">
      <Header
        title={t("Auto-listen on launch")}
        description={t(
          "Start listening automatically when the app opens; meeting apps (Tencent Meeting, DingTalk, Feishu, Zoom…) are detected and captured first"
        )}
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{t("Auto-listen on launch")}</Label>
        <Switch
          checked={on}
          onCheckedChange={(v) => {
            setAutoListen(v);
            setOn(v);
          }}
          aria-label={t("Auto-listen on launch")}
        />
      </div>
    </div>
  );
};
