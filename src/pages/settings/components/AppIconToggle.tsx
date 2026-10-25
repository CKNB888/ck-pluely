import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

import { t } from "@/i18n";

interface AppIconToggleProps {
  className?: string;
}

export const AppIconToggle = ({ className }: AppIconToggleProps) => {
  const { customizable, toggleAppIconVisibility } = useApp();

  const handleSwitchChange = async (checked: boolean) => {
    await toggleAppIconVisibility(checked);
  };

  return (
    <div id="app-icon" className={`space-y-2 ${className}`}>
      <Header
        title={t("App Icon Stealth Mode")}
        description={t(
          "Control dock/taskbar icon visibility when window is hidden for maximum discretion"
        )}
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {!customizable.appIcon.isVisible
                ? t("Show Icon in Dock/Taskbar")
                : t("Hide Icon from Dock/Taskbar")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {`Toggle to make App Icon ${
                !customizable.appIcon.isVisible ? t("Visible") : t("Hidden")
              }`}
            </p>
          </div>
        </div>
        <Switch
          checked={customizable.appIcon.isVisible}
          onCheckedChange={handleSwitchChange}
          aria-label={t("Toggle app icon visibility")}
        />
      </div>
    </div>
  );
};
