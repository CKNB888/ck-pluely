import { ScreenshotConfigs } from "./components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

import { t } from "@/i18n";

const Settings = () => {
  const settings = useSettings();
  return (
    <PageLayout
      title={t("Screenshot")}
      description={t("Manage your screenshot settings")}
    >
      {/* Screenshot Configs */}
      <ScreenshotConfigs {...settings} />
    </PageLayout>
  );
};

export default Settings;
