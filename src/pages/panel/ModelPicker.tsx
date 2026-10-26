import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useApp } from "@/contexts";
import { providerLabel } from "@/lib/ui-style";
import { rememberedProviders } from "@/lib/provider-memory";

/**
 * ck-pluely v2.1.1: switch provider / model right in the menu-bar panel.
 * Everything is drawn in the panel's own (capture-protected) webview — no native
 * <select>/datalist popups, which on macOS open an unprotected NSMenu.
 */
export const ModelPicker = ({ kind, onMore }: { kind: "ai" | "stt"; onMore: () => void }) => {
  const app = useApp();
  const sel = kind === "ai" ? app.selectedAIProvider : app.selectedSttProvider;
  const set = kind === "ai" ? app.onSetSelectedAIProvider : app.onSetSelectedSttProvider;
  const all = kind === "ai" ? app.allAiProviders : app.allSttProviders;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const model = sel?.variables?.model || sel?.variables?.MODEL || "";
  const remembered = rememberedProviders(kind).filter((r) => all.some((p) => p.id === r.provider));
  const providers = [
    ...(sel?.provider && !remembered.some((r) => r.provider === sel.provider) ? [{ provider: sel.provider, models: model ? [model] : [] }] : []),
    ...remembered,
  ];
  const current = remembered.find((r) => r.provider === sel?.provider);
  const models = Array.from(new Set([model, ...(current?.models ?? [])].filter(Boolean)));
  const modelKey = sel?.variables && "MODEL" in sel.variables && !("model" in sel.variables) ? "MODEL" : "model";
  const setModel = (m: string) => {
    if (!sel?.provider || !m.trim()) return;
    set({ provider: sel.provider, variables: { ...sel.variables, [modelKey]: m.trim() } });
  };

  return (
    <div data-testid={`picker-${kind}`}>
      <button
        type="button"
        data-testid={`picker-${kind}-toggle`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent/60"
      >
        <span className="text-muted-foreground">{kind === "ai" ? "对话模型" : "语音识别"}</span>
        <span className="flex min-w-0 items-center gap-1 truncate font-medium">
          <span className="truncate" data-testid={`picker-${kind}-value`}>
            {providerLabel(sel?.provider)}
            {model ? ` · ${model}` : ""}
          </span>
          <ChevronDownIcon className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t bg-muted/40 px-3 py-2 text-[12px]">
          <div className="flex flex-wrap gap-1">
            {providers.map((p) => (
              <button
                key={p.provider}
                type="button"
                data-testid={`picker-${kind}-provider-${p.provider}`}
                onClick={() => set({ provider: p.provider, variables: {} })}
                className={`flex items-center gap-1 rounded-md border px-2 py-0.5 ${p.provider === sel?.provider ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-accent"}`}
              >
                {p.provider === sel?.provider ? <CheckIcon className="size-3" /> : null}
                {providerLabel(p.provider)}
              </button>
            ))}
            <button type="button" onClick={onMore} className="rounded-md px-2 py-0.5 text-muted-foreground hover:bg-accent">
              更多服务商…
            </button>
          </div>
          {sel?.provider && (kind === "ai" || "model" in (sel.variables ?? {})) ? (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`picker-${kind}-model-${m}`}
                    onClick={() => setModel(m)}
                    className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${m === model ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-accent"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  setModel(draft);
                  setDraft("");
                }}
              >
                <input
                  data-testid={`picker-${kind}-model-input`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="输入模型名，回车切换"
                  autoComplete="off"
                  className="h-7 min-w-0 flex-1 rounded-md border bg-card px-2 font-mono text-[11px] outline-none focus:border-primary"
                />
                <button type="submit" className="h-7 rounded-md bg-primary px-2 text-primary-foreground">
                  切换
                </button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
