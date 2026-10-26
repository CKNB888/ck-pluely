import { useState } from "react";
import { CheckCircle2, Pencil, RotateCcw } from "lucide-react";
import { Button, Header, Textarea } from "@/components";
import { safeLocalStorage } from "@/lib";
import {
  BUILTIN_PROMPTS,
  SELECTED_BUILTIN_KEY,
  builtinPromptText,
  isBuiltinEdited,
  resetBuiltin,
  saveBuiltinOverride,
} from "@/lib/builtin-prompts";

interface Props {
  onUse: (text: string) => void;
  /** A user prompt is selected, so no built-in is active. */
  userSelected: boolean;
}

/** 内置系统提示词：选择、编辑、恢复默认。编辑保存在本地设置里，随备份一起导出。 */
export const BuiltinPrompts = ({ onUse, userSelected }: Props) => {
  const [active, setActive] = useState(() => safeLocalStorage.getItem(SELECTED_BUILTIN_KEY));
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [, bump] = useState(0);
  const groups = Array.from(new Set(BUILTIN_PROMPTS.map((p) => p.group)));

  const use = (id: string) => {
    safeLocalStorage.setItem(SELECTED_BUILTIN_KEY, id);
    setActive(id);
    onUse(builtinPromptText(id));
  };

  return (
    <div className="space-y-3" id="builtin-prompts">
      <Header
        title="内置提示词"
        description="按场景精心编写：结论先行、要点高亮、尽量省 tokens。可直接使用，也可以改成自己的版本，随时恢复默认。"
      />
      {groups.map((g) => (
        <div key={g} className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">{g}</div>
          <div className="grid gap-2 md:grid-cols-2">
            {BUILTIN_PROMPTS.filter((p) => p.group === g).map((p) => {
              const on = !userSelected && active === p.id;
              const edited = isBuiltinEdited(p.id);
              return (
                <div key={p.id} className={`rounded-lg border p-3 ${on ? "border-primary/60 bg-primary/5" : "border-input/50"}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                    {edited ? <span className="text-[11px] text-muted-foreground">已修改</span> : null}
                    {on ? <CheckCircle2 className="size-4 text-primary" /> : null}
                  </div>
                  {editing === p.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-40 text-xs" />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          取消
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            saveBuiltinOverride(p.id, draft);
                            setEditing(null);
                            if (on) onUse(builtinPromptText(p.id));
                            bump((n) => n + 1);
                          }}
                        >
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{builtinPromptText(p.id)}</p>
                      <div className="mt-2 flex gap-1.5">
                        <Button size="sm" variant={on ? "secondary" : "default"} className="h-7" onClick={() => use(p.id)}>
                          {on ? "使用中" : "使用"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => {
                            setDraft(builtinPromptText(p.id));
                            setEditing(p.id);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          编辑
                        </Button>
                        {edited ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => {
                              resetBuiltin(p.id);
                              if (on) onUse(builtinPromptText(p.id));
                              bump((n) => n + 1);
                            }}
                          >
                            <RotateCcw className="size-3.5" />
                            恢复默认
                          </Button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
