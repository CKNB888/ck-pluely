import { AlertCircleIcon, LoaderIcon } from "lucide-react";

import { t } from "@/i18n";

type Props = {
  setupRequired: boolean;
  error: string;
  isProcessing: boolean;
  isAIProcessing: boolean;
  capturing: boolean;
};

export const StatusIndicator = ({
  setupRequired,
  error,
  isProcessing,
  isAIProcessing,
  capturing,
}: Props) => {
  // Don't show anything if not capturing and no error
  if (!capturing && !error && !isProcessing && !isAIProcessing) {
    return null;
  }

  return (
    <div className="flex flex-1 min-w-0 items-center gap-2 px-3 py-2 justify-end" role="status" aria-live="polite">
      {/* Priority: Error > AI Processing > Transcribing > Listening */}
      {error && !setupRequired ? (
        <div className="flex min-w-0 items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircleIcon className="w-4 h-4 shrink-0" />
          {/* Long provider errors would push the controls off the bar. */}
          <span className="text-xs font-medium truncate" title={error}>{error}</span>
        </div>
      ) : isAIProcessing ? (
        <div className="flex items-center gap-2 animate-pulse">
          <LoaderIcon className="w-4 h-4 animate-spin" />
          <span className="text-xs font-medium">
            {t("Generating response...")}
          </span>
        </div>
      ) : isProcessing ? (
        <div className="flex items-center gap-2 animate-pulse">
          <LoaderIcon className="w-4 h-4 animate-spin" />
          <span className="text-xs font-medium">{t("Transcribing...")}</span>
        </div>
      ) : capturing ? (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium">{t("Listening...")}</span>
        </div>
      ) : null}
    </div>
  );
};
