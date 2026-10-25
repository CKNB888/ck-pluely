import { Button } from "@/components";
import { t } from "@/i18n";
import { checkProvider, ProviderCheckResult } from "@/lib/functions/provider-check";
import { CheckCircle2Icon, Loader2Icon, PlugZapIcon, XCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

/** "测试连接" button + model picker filled from GET /models (manual entry stays available). */
export const ProviderCheck = ({
  curl,
  variables,
  onPickModel,
}: {
  curl?: string;
  variables: Record<string, string>;
  onPickModel?: (model: string) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProviderCheckResult | null>(null);

  useEffect(() => setResult(null), [curl]);
  if (!curl) return null;

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await checkProvider(curl, variables));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={run} disabled={busy}>
          {busy ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <PlugZapIcon className="h-4 w-4" />
          )}
          {busy ? t("Testing…") : t("Test connection")}
        </Button>
        {result ? (
          <span
            className={`flex items-center gap-1 text-xs ${result.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
          >
            {result.ok ? (
              <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircleIcon className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="break-all">{result.message}</span>
          </span>
        ) : null}
      </div>
      {result?.models?.length && onPickModel ? (
        <select
          className="w-full h-9 rounded-md border border-input/50 bg-background px-2 text-sm"
          defaultValue=""
          onChange={(e) => e.target.value && onPickModel(e.target.value)}
        >
          <option value="">{t("Pick a model from the list (or type it below)")}</option>
          {result.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
};
