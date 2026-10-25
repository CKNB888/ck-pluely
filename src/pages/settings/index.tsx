import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutostartToggle,
  UiLanguage,
  PrivacyCheck,
  UiStyle,
} from "./components";
import { PageLayout } from "@/layouts";

import { t } from "@/i18n";

const Settings = () => {
  return (
    <PageLayout title={t("Settings")} description={t("Manage your settings")}>
      {/* Interface Language */}
      <UiLanguage />

      <UiStyle />

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

    </PageLayout>
  );
};

export default Settings;
