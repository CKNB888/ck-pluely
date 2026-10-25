import { CK_HIDE_UPSTREAM_PAID } from "@/config/ck";
import { useState } from "react";
import { Button } from "@/components";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ANALYTICS_EVENTS, captureEvent } from "@/lib";

import { t } from "@/i18n";

interface CheckoutResponse {
  success?: boolean;
  checkout_url?: string;
  error?: string;
}
export const GetLicense = ({
  setState,
  buttonText,
  buttonClassName = "",
}: {
  setState?: React.Dispatch<React.SetStateAction<boolean>>;
  buttonText?: string;
  buttonClassName?: string;
}) => {
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  const handleGetLicenseKey = async () => {
    setIsCheckoutLoading(true);

    try {
      const response: CheckoutResponse = await invoke("get_checkout_url");

      if (response.success && response.checkout_url) {
        // Open checkout URL in default browser
        await openUrl(response.checkout_url);
        setState?.(false);
      }
    } catch (err) {
      console.error("Failed to get checkout URL:", err);
    } finally {
      setIsCheckoutLoading(false);
      // Track get license
      await captureEvent(ANALYTICS_EVENTS.GET_LICENSE);
    }
  };

  if (CK_HIDE_UPSTREAM_PAID) return null;

  return (
    <Button
      onClick={handleGetLicenseKey}
      disabled={isCheckoutLoading}
      size="sm"
      className={buttonClassName}
    >
      {isCheckoutLoading ? t("Loading...") : buttonText || t("Get License")}
    </Button>
  );
};
