import { AIProviders, STTProviders } from "./components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

import { t } from "@/i18n";

const DevSpace = () => {
  const settings = useSettings();

  return (
    <PageLayout title={t("Dev Space")} description={t("Manage your dev space")}>
      {/* Provider Selection */}
      <AIProviders {...settings} />

      {/* STT Providers */}
      <STTProviders {...settings} />
    </PageLayout>
  );
};

export default DevSpace;
