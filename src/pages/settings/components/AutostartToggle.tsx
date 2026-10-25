import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

import { t } from "@/i18n";

interface AutostartToggleProps {
  className?: string;
}

export const AutostartToggle = ({ className }: AutostartToggleProps) => {
  const { customizable, toggleAutostart } = useApp();

  const isEnabled = customizable?.autostart?.isEnabled ?? true;

  const handleSwitchChange = async (checked: boolean) => {
    await toggleAutostart(checked);
  };

  return (
    <div id="autostart" className={`space-y-2 ${className}`}>
      <Header
        title={t("Launch on Startup")}
        description={t("Automatically open Pluely when your system starts")}
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">{t("Open on Start")}</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {isEnabled
                ? t("Pluely will launch automatically on system startup")
                : t("Pluely will not launch automatically")}
            </p>
          </div>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleSwitchChange}
          aria-label={t("Toggle autostart")}
        />
      </div>
    </div>
  );
};
