import { Header, Selection } from "@/components";
import { LANGUAGES } from "@/lib";
import { updateLanguage } from "@/lib/storage/response-settings.storage";
import { useState, useEffect, useMemo } from "react";
import { getResponseSettings, DEFAULT_LANGUAGE } from "@/lib";

import { t } from "@/i18n";

export const LanguageSelector = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>(DEFAULT_LANGUAGE);

  useEffect(() => {
    const settings = getResponseSettings();
    setSelectedLanguage(settings.language);
  }, []);

  const handleLanguageChange = (languageId: string) => {
    setSelectedLanguage(languageId);
    updateLanguage(languageId);
  };

  const languageOptions = useMemo(() => {
    return LANGUAGES.map((lang) => ({
      label: `${lang.flag} ${t(lang.name)}`,
      value: lang.id,
    }));
  }, []);

  return (
    <div className="space-y-4">
      <Header
        title={t("Response Language")}
        description={t(
          "Select the language for AI responses. Setting applies globally to all providers and conversations. Language support may vary depending on your selected LLM provider"
        )}
        isMainTitle
      />

      <div className="max-w-md">
        <Selection
          selected={selectedLanguage}
          onChange={handleLanguageChange}
          options={languageOptions}
          placeholder={t("Select a language")}
        />
      </div>
    </div>
  );
};
