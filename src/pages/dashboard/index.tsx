import { CK_HIDE_UPSTREAM_PAID } from "@/config/ck";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GetLicense, MacOsVersionNotice } from "@/components";
import { PluelyApiSetup, Usage } from "./components";
import { PageLayout } from "@/layouts";
import { useApp } from "@/contexts";

import { t } from "@/i18n";

const Dashboard = () => {
  const { hasActiveLicense } = useApp();
  const [activity, setActivity] = useState<any>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const fetchActivity = useCallback(async () => {
    if (!hasActiveLicense || CK_HIDE_UPSTREAM_PAID) {
      setActivity({ data: [], total_tokens_used: 0 });
      return;
    }
    setLoadingActivity(true);
    try {
      const response = await invoke("get_activity");
      const responseData: any = response;
      if (responseData && responseData.success) {
        setActivity(responseData);
      } else {
        setActivity({ data: [], total_tokens_used: 0 });
      }
    } catch (error) {
      setActivity({ data: [], total_tokens_used: 0 });
    } finally {
      setLoadingActivity(false);
    }
  }, [hasActiveLicense]);

  useEffect(() => {
    if (hasActiveLicense) {
      fetchActivity();
    } else {
      setActivity(null);
    }
  }, [fetchActivity, hasActiveLicense]);

  const activityData =
    activity && Array.isArray(activity.data) ? activity.data : [];
  const totalTokens =
    activity && typeof activity.total_tokens_used === "number"
      ? activity.total_tokens_used
      : 0;

  return (
    <PageLayout
      title={t("Dashboard")}
      description={
        CK_HIDE_UPSTREAM_PAID
          ? t("Set up your AI and speech providers in Dev space, then start the Copilot from the main window.")
          : t(
              "Pluely license to unlock faster responses, quicker support and premium features."
            )
      }
      rightSlot={!hasActiveLicense ? <GetLicense /> : null}
    >
      <MacOsVersionNotice />
      {/* Pluely API Setup */}
      <PluelyApiSetup />

      {!CK_HIDE_UPSTREAM_PAID && (
      <Usage
        loading={loadingActivity}
        onRefresh={fetchActivity}
        data={activityData}
        totalTokens={totalTokens}
      />
      )}
    </PageLayout>
  );
};

export default Dashboard;
