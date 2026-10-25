import { useState } from "react";
import { Header, Selection } from "@/components";
import {
  getStoredUiLanguage,
  setUiLanguage,
  SUPPORTED_UI_LANGUAGES,
  t,
} from "@/i18n";
import { useTranslation } from "react-i18next";

export const UiLanguage = () => {
  useTranslation();
  const [value, setValue] = useState<string>(getStoredUiLanguage());

  return (
    <div id="ui-language" className="space-y-3">
      <Header
        title={t("Interface Language")}
        description={t(
          "Choose the language of the Pluely interface. System default follows your operating system language."
        )}
        isMainTitle
      />
      <div className="max-w-md">
        <Selection
          selected={value}
          options={SUPPORTED_UI_LANGUAGES.map((l) => ({
            label: l.id === "system" ? t(l.name) : l.name,
            value: l.id,
          }))}
          placeholder={t("Select language")}
          onChange={(v: string) => {
            setValue(v);
            setUiLanguage(v);
          }}
        />
      </div>
    </div>
  );
};
