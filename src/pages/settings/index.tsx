import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutoListenToggle,
  AutostartToggle,
  UiLanguage,
  PrivacyCheck,
  UiStyle,
  FullUninstall,
  LocalSpeech,
  Display,
  Backup,
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

      <Display />

      {/* Autostart Toggle */}
      <AutostartToggle />

      <AutoListenToggle />

      {/* App Icon Toggle */}
      <AppIconToggle />

      {/* 隐私自检 */}
      <PrivacyCheck />

      {/* Always On Top Toggle */}
      <AlwaysOnTopToggle />

      <LocalSpeech />

      <Backup />

      <FullUninstall />

    </PageLayout>
  );
};

export default Settings;
