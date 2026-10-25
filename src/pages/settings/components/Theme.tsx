import { useApp, useTheme } from "@/contexts";
import { Header, Label, Slider, Button } from "@/components";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components";

import { t } from "@/i18n";

export const Theme = () => {
  const { theme, transparency, setTheme, onSetTransparency } = useTheme();
  const { hasActiveLicense } = useApp();

  return (
    <div id="theme" className="relative space-y-3">
      <Header
        title={t("Theme Customization {{v0}}", {
          v0: hasActiveLicense
            ? ""
            : t(" (You need an active license to use this feature)"),
        })}
        description={t(
          "Personalize your experience with custom theme and transparency settings"
        )}
        isMainTitle
      />

      {/* Theme Toggle */}
      <div
        className={`space-y-2 ${
          hasActiveLicense ? "" : "opacity-60 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div>
              <Label className="text-sm font-medium flex items-center gap-2">
                {theme === "system" ? (
                  <>
                    <MonitorIcon className="h-4 w-4" />
                    {t("System")}
                  </>
                ) : theme === "light" ? (
                  <>
                    <SunIcon className="h-4 w-4" />
                    {t("Light Mode")}
                  </>
                ) : (
                  <>
                    <MoonIcon className="h-4 w-4" />
                    {t("Dark Mode")}
                  </>
                )}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {theme === "light"
                  ? t(
                      "Using light theme for better visibility in bright environments"
                    )
                  : theme === "dark"
                    ? t("Using dark theme for comfortable viewing in low light")
                    : t("Follows your operating system's light/dark setting")}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                {theme === "system" ? (
                  <MonitorIcon className="h-[1.2rem] w-[1.2rem]" />
                ) : (
                  <>
                    <SunIcon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                    <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}>
                {t("Light")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                {t("Dark")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                {t("System")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Transparency Slider */}
      <div
        className={`space-y-2 ${
          hasActiveLicense ? "" : "opacity-60 pointer-events-none"
        }`}
      >
        <Header
          title={t("Window Transparency")}
          description={t(
            "Adjust the transparency level of the application window"
          )}
        />
        <div className="space-y-3">
          <div className="flex items-center gap-4 mt-4">
            <Slider
              value={[transparency]}
              onValueChange={(value: number[]) => onSetTransparency(value[0])}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>

          <p className="text-xs text-muted-foreground/70">
            {t(
              "💡 Tip: Higher transparency lets you see through the window, perfect for dark overlay. Changes apply immediately."
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
