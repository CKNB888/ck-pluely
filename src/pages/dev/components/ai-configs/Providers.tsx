import { KeyList } from "@/components";
import { splitApiKeys } from "@/lib/functions/net";
import { ProviderCheck } from "../shared/ProviderCheck";
import { Button, Header, Input, Selection, TextInput } from "@/components";
import { UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { KeyIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { t } from "@/i18n";

export const Providers = ({
  allAiProviders,
  selectedAIProvider,
  onSetSelectedAIProvider,
  variables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);

  useEffect(() => {
    if (selectedAIProvider?.provider) {
      const provider = allAiProviders?.find(
        (p) => p?.id === selectedAIProvider?.provider
      );
      if (provider) {
        const json = curl2Json(provider?.curl);
        setLocalSelectedProvider(json as ResultJSON);
      }
    }
  }, [selectedAIProvider?.provider]);

  const findKeyAndValue = (key: string) => {
    return variables?.find((v) => v?.key === key);
  };

  const getApiKeyValue = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedAIProvider?.variables) return "";
    return selectedAIProvider?.variables?.[apiKeyVar.key] || "";
  };

  const isApiKeyEmpty = () => {
    return !getApiKeyValue().trim();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Header
          title={t("Select AI Provider")}
          description={t(
            "Select your preferred AI service provider or custom providers to get started."
          )}
        />
        <Selection
          selected={selectedAIProvider?.provider}
          options={allAiProviders?.map((provider) => {
            const json = curl2Json(provider?.curl);
            return {
              label: provider?.isCustom
                ? json?.url || "Custom Provider"
                : provider?.id || "Custom Provider",
              value: provider?.id || "Custom Provider",
              isCustom: provider?.isCustom,
            };
          })}
          placeholder={t("Choose your AI provider")}
          onChange={(value) => {
            onSetSelectedAIProvider({
              provider: value,
              variables: {},
            });
          }}
        />
      </div>

      {localSelectedProvider ? (
        <Header
          title={t("Method: {{v0}}, Endpoint: {{v1}}", {
            v0: localSelectedProvider?.method || t("Invalid"),
            v1: localSelectedProvider?.url || t("Invalid"),
          })}
          description={t(
            "If you want to use different url or method, you can always create a custom provider."
          )}
        />
      ) : null}

      {findKeyAndValue("api_key") ? (
        <div className="space-y-2">
          <Header
            title={t("API Key")}
            description={t(
              "Enter your {{v0}} API key to authenticate and access AI models. Your key is stored locally and never shared.",
              {
                v0: allAiProviders?.find(
                  (p) => p?.id === selectedAIProvider?.provider
                )?.isCustom
                  ? t("Custom Provider")
                  : selectedAIProvider?.provider,
              }
            )}
          />

          {splitApiKeys(getApiKeyValue()).length > 0 ? (
            <KeyList
              value={getApiKeyValue()}
              scope={`ai:${selectedAIProvider?.provider ?? ""}`}
              onChange={(v) => {
                const apiKeyVar = findKeyAndValue("api_key");
                if (!apiKeyVar || !selectedAIProvider) return;
                onSetSelectedAIProvider({
                  ...selectedAIProvider,
                  variables: { ...selectedAIProvider.variables, [apiKeyVar.key]: v },
                });
              }}
            />
          ) : null}

          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={t("API key — separate several keys with commas to rotate on rate limits")}
                value={getApiKeyValue()}
                onChange={(value) => {
                  const apiKeyVar = findKeyAndValue("api_key");
                  if (!apiKeyVar || !selectedAIProvider) return;

                  onSetSelectedAIProvider({
                    ...selectedAIProvider,
                    variables: {
                      ...selectedAIProvider.variables,
                      [apiKeyVar.key]:
                        typeof value === "string" ? value : value.target.value,
                    },
                  });
                }}
                onKeyDown={(e) => {
                  const apiKeyVar = findKeyAndValue("api_key");
                  if (!apiKeyVar || !selectedAIProvider) return;

                  onSetSelectedAIProvider({
                    ...selectedAIProvider,
                    variables: {
                      ...selectedAIProvider.variables,
                      [apiKeyVar.key]: (e.target as HTMLInputElement).value,
                    },
                  });
                }}
                disabled={false}
                className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
              />
              {isApiKeyEmpty() ? (
                <Button
                  onClick={() => {
                    const apiKeyVar = findKeyAndValue("api_key");
                    if (!apiKeyVar || !selectedAIProvider || isApiKeyEmpty())
                      return;

                    onSetSelectedAIProvider({
                      ...selectedAIProvider,
                      variables: {
                        ...selectedAIProvider.variables,
                        [apiKeyVar.key]: getApiKeyValue(),
                      },
                    });
                  }}
                  disabled={isApiKeyEmpty()}
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  title={t("Submit API Key")}
                >
                  <KeyIcon className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    const apiKeyVar = findKeyAndValue("api_key");
                    if (!apiKeyVar || !selectedAIProvider) return;

                    onSetSelectedAIProvider({
                      ...selectedAIProvider,
                      variables: {
                        ...selectedAIProvider.variables,
                        [apiKeyVar.key]: "",
                      },
                    });
                  }}
                  size="icon"
                  variant="destructive"
                  className="shrink-0 h-11 w-11"
                  title={t("Remove API Key")}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <ProviderCheck
        curl={allAiProviders?.find((p) => p?.id === selectedAIProvider?.provider)?.curl}
        variables={selectedAIProvider?.variables || {}}
        onPickModel={(model) => {
          if (!selectedAIProvider) return;
          onSetSelectedAIProvider({
            ...selectedAIProvider,
            variables: { ...selectedAIProvider.variables, model },
          });
        }}
      />

      <div className="space-y-4 mt-2">
        {variables
          .filter(
            (variable) => variable.key !== findKeyAndValue("api_key")?.key
          )
          .map((variable) => {
            const getVariableValue = () => {
              if (!variable?.key || !selectedAIProvider?.variables) return "";
              return selectedAIProvider.variables[variable.key] || "";
            };

            return (
              <div className="space-y-1" key={variable?.key}>
                <Header
                  title={
                    variable?.key?.toLowerCase() === "model"
                      ? t("Model")
                      : variable?.value || ""
                  }
                  description={t("add your preferred {{v0}} for {{v1}}", {
                    v0:
                      variable?.key?.toLowerCase() === "model"
                        ? t("Model")
                        : variable?.key?.replace(/_/g, " "),

                    v1: allAiProviders?.find(
                      (p) => p?.id === selectedAIProvider?.provider
                    )?.isCustom
                      ? t("Custom Provider")
                      : selectedAIProvider?.provider,
                  })}
                />
                <TextInput
                  placeholder={
                    variable?.key?.toLowerCase() === "model" &&
                    allAiProviders?.find((p) => p?.id === selectedAIProvider?.provider)
                      ?.modelHint
                      ? t("e.g. {{v0}}", {
                          v0: allAiProviders?.find(
                            (p) => p?.id === selectedAIProvider?.provider
                          )?.modelHint,
                        })
                      : t("Enter {{v0}} {{v1}}", {
                    v0: allAiProviders?.find(
                      (p) => p?.id === selectedAIProvider?.provider
                    )?.isCustom
                      ? t("Custom Provider")
                      : selectedAIProvider?.provider,

                    v1: variable?.key?.replace(/_/g, " ") || "value",
                  })
                  }
                  value={getVariableValue()}
                  onChange={(value) => {
                    if (!variable?.key || !selectedAIProvider) return;

                    onSetSelectedAIProvider({
                      ...selectedAIProvider,
                      variables: {
                        ...selectedAIProvider.variables,
                        [variable.key]: value,
                      },
                    });
                  }}
                />
              </div>
            );
          })}
      </div>
    </div>
  );
};
