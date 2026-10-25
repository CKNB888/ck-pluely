import { UseSettingsReturn } from "@/types";
import { Card, Button, Header } from "@/components";
import { EditIcon, TrashIcon } from "lucide-react";
import { CreateEditProvider } from "./CreateEditProvider";
import { useCustomSttProviders } from "@/hooks";
import curl2Json from "@bany/curl-to-json";

import { t } from "@/i18n";

export const CustomProviders = ({ allSttProviders }: UseSettingsReturn) => {
  const customProviderHook = useCustomSttProviders();
  const {
    handleEdit,
    handleDelete,
    deleteConfirm,
    confirmDelete,
    cancelDelete,
  } = customProviderHook;

  return (
    <div className="space-y-2">
      <Header
        title={t("Custom STT Providers")}
        description={t(
          "Create and manage custom STT providers. Configure endpoints, authentication, and response formats."
        )}
      />

      <div className="space-y-2">
        {/* Existing Custom Providers */}
        {allSttProviders.filter((provider) => provider?.isCustom).length >
          0 && (
          <div className="space-y-2">
            {allSttProviders
              .filter((provider) => provider?.isCustom)
              .map((provider) => {
                const json = curl2Json(provider?.curl);

                return (
                  <Card
                    key={provider?.id}
                    className="p-3 border !bg-transparent border-input/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm">
                          {json?.url || t("Invalid curl command")}
                        </h4>

                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground">
                            {`Response Path: ${
                              provider?.responseContentPath || t("Not set")
                            }`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {" • "}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("Streaming:")}{" "}
                            {provider?.streaming ? t("Yes") : t("No")}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            provider?.id && handleEdit(provider?.id)
                          }
                          title={t("Edit Provider")}
                        >
                          <EditIcon className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            provider?.id && handleDelete(provider?.id)
                          }
                          title={t("Delete Provider")}
                          className="text-destructive hover:text-destructive"
                        >
                          <TrashIcon className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        )}
      </div>
      <CreateEditProvider customProviderHook={customProviderHook} />

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">
              {t("Delete Custom STT Provider")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t(
                "Are you sure you want to delete this custom STT provider? This action cannot be undone."
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelDelete}>
                {t("Cancel")}
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                {t("Delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
