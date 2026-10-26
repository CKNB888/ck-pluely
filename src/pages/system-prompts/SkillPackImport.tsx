import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button, Header } from "@/components";
import { parseSkillPack } from "@/lib/skill-pack";

interface Props {
  onCreate: (p: { name: string; prompt: string }) => Promise<unknown>;
}

/** 导入技能包：只读取文本提示词，导入后成为普通的自定义提示词，可编辑、可删除、随备份导出。 */
export const SkillPackImport = ({ onCreate }: Props) => {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const prompts = parseSkillPack(await file.text(), file.name);
      for (const p of prompts) await onCreate(p);
      setMsg(`已导入 ${prompts.length} 个提示词`);
    } catch (e) {
      setMsg(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-2" id="skill-pack-import">
      <Header
        title="导入技能包"
        description="支持 .json 提示词包和 Agent Skills 风格的 SKILL.md。只导入文字提示词，不运行任何脚本、不联网。"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => input.current?.click()} data-testid="skill-import">
          <Upload className="size-3.5" />
          选择文件
        </Button>
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,.md,.markdown,.txt"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  );
};
