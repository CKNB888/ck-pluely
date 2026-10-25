import {
  ResponseLength,
  LanguageSelector,
  AutoScrollToggle,
} from "./components";
import { PageLayout } from "@/layouts";
import { useApp } from "@/contexts";

import { t } from "@/i18n";

const Responses = () => {
  const { hasActiveLicense } = useApp();

  return (
    <PageLayout
      title={t("Response Settings")}
      description={t("Customize how AI generates and displays responses")}
    >
      {!hasActiveLicense && (
        <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <p className="text-[10px] lg:text-sm text-foreground font-medium mb-2">{t("🔒 Premium Features")}</p>
          <p className="text-[10px] lg:text-sm text-muted-foreground">{t(
            "Response customization features (Response Length, Language Selection, and Auto-Scroll Control) require an active license to use."
          )}</p>
        </div>
      )}

      {/* Response Length */}
      <ResponseLength />

      {/* Language Selector */}
      <LanguageSelector />

      {/* Auto-Scroll Toggle */}
      <AutoScrollToggle />
    </PageLayout>
  );
};

export default Responses;
