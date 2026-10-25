import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";
import { useState, useEffect } from "react";
import { getResponseSettings, updateAutoScroll } from "@/lib";

import { t } from "@/i18n";

export const AutoScrollToggle = () => {
  const { hasActiveLicense } = useApp();
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  useEffect(() => {
    const settings = getResponseSettings();
    setAutoScroll(settings.autoScroll);
  }, []);

  const handleSwitchChange = (checked: boolean) => {
    if (!hasActiveLicense) {
      return;
    }
    setAutoScroll(checked);
    updateAutoScroll(checked);
  };

  return (
    <div className="space-y-4">
      <Header
        title={t("Auto-Scroll Behavior")}
        description={t(
          "Control whether responses automatically scroll to the bottom. This setting applies immediately and controls whether responses automatically scroll to the latest content as it streams"
        )}
        isMainTitle
      />

      <div className="flex items-center justify-between p-4 border rounded-xl">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {autoScroll ? t("Auto-Scroll Enabled") : t("Auto-Scroll Disabled")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {autoScroll
                ? t("Responses will automatically scroll to the bottom as they arrive")
                : t("Responses will stay at your current scroll position")}
            </p>
          </div>
        </div>
        <Switch
          checked={autoScroll}
          onCheckedChange={handleSwitchChange}
          disabled={!hasActiveLicense}
          title={t("Toggle to {{v0}} auto-scroll", {
            v0: autoScroll ? t("Disable") : t("Enable")
          })}
          aria-label={t("Toggle to {{v0}} auto-scroll", {
            v0: autoScroll ? t("Disable") : t("Enable")
          })}
        />
      </div>
    </div>
  );
};
