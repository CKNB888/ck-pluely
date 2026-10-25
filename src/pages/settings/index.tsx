import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutostartToggle,
  UiLanguage,
  PrivacyCheck,
} from "./components";
import { PageLayout } from "@/layouts";

import { t } from "@/i18n";

const Settings = () => {
  return (
    <PageLayout title={t("Settings")} description={t("Manage your settings")}>
      {/* Interface Language */}
      <UiLanguage />

      {/* Theme */}
      <Theme />

      {/* Autostart Toggle */}
      <AutostartToggle />

      {/* App Icon Toggle */}
      <AppIconToggle />

      {/* 隐私自检 */}
      <PrivacyCheck />

      {/* Always On Top Toggle */}
      <AlwaysOnTopToggle />

      <p className="pt-4 text-center text-[11px] text-muted-foreground/70 select-none">
        {t("Translation & fixes by")}{" "}
        <a
          href="https://github.com/CKNB888"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline hover:text-foreground"
        >
          CKNB
        </a>
      </p>
    </PageLayout>
  );
};

export default Settings;
