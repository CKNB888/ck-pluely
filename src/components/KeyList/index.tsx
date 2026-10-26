import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { t } from "@/i18n";
import { Button, Input, Switch, Label } from "@/components/ui";
import { coolingKeys, getRoundRobin, maskKey, setRoundRobin, splitApiKeys } from "@/lib/functions/net";

interface KeyListProps {
  /** Raw field value: keys separated by new lines / commas. */
  value: string;
  onChange: (value: string) => void;
  /** Rotation scope used by the request code (provider id). */
  scope?: string;
}

/** Several API keys for one provider: add, remove, reorder; masked, never shown in full. */
export const KeyList = ({ value, onChange, scope }: KeyListProps) => {
  const keys = splitApiKeys(value);
  const [draft, setDraft] = useState("");
  const [rr, setRr] = useState(getRoundRobin());
  const cooling = new Set(scope ? coolingKeys(scope) : []);
  const save = (next: string[]) => onChange(next.join("\n"));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const add = () => {
    const extra = splitApiKeys(draft);
    if (!extra.length) return;
    save(Array.from(new Set([...keys, ...extra])));
    setDraft("");
  };

  return (
    <div className="space-y-2 rounded-lg border border-input/50 p-3" id="key-list">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {t("Keys ({{v0}})", { v0: keys.length })}
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("Round-robin")}</span>
          <Switch
            checked={rr}
            onCheckedChange={(v) => {
              setRoundRobin(v);
              setRr(v);
            }}
            aria-label={t("Round-robin")}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("When a key hits a rate limit, quota or auth error it rests for a while and the next key is used automatically.")}
      </p>
      {keys.map((k, i) => (
        <div key={k} className="flex items-center gap-2 text-sm">
          <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
          <code className="flex-1 truncate font-mono text-xs">{maskKey(k)}</code>
          {cooling.has(k) ? (
            <span className="rounded bg-amber-500/15 px-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              {t("Resting")}
            </span>
          ) : null}
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} title={t("Move up")}>
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === keys.length - 1} onClick={() => move(i, 1)} title={t("Move down")}>
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => save(keys.filter((_, j) => j !== i))} title={t("Remove key")}>
            <Trash2Icon className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder={t("Add another key")}
          value={draft}
          onChange={(e) => setDraft(typeof e === "string" ? e : e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="h-9 flex-1"
        />
        <Button size="icon" className="h-9 w-9" onClick={add} disabled={!draft.trim()} title={t("Add key")}>
          <PlusIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
