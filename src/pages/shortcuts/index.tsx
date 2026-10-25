import { CursorSelection, ShortcutManager } from "./components";
import { PageLayout } from "@/layouts";

import { t } from "@/i18n";

const Shortcuts = () => {
  return (
    <PageLayout
      title={t("Cursor & Keyboard Shortcuts")}
      description={t("Manage your cursor and keyboard shortcuts")}
    >
      <div className="flex flex-col gap-6 pb-8">
        {/* Cursor Selection */}
        <CursorSelection />

        {/* Keyboard Shortcuts */}
        <ShortcutManager />
      </div>
    </PageLayout>
  );
};

export default Shortcuts;
