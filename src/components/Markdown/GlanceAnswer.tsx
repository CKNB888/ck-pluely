import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Markdown } from "./index";
import { splitGlance } from "@/lib/glance";

/** 回答：结论 + 要点常显，细节折叠（点开后记住，直到下一条回答）。 */
export function GlanceAnswer({ children, isStreaming = false }: { children: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const { head, detail } = splitGlance(children);
  return (
    <div className="ck-glance" style={{ overflowAnchor: "none" }}>
      <Markdown isStreaming={isStreaming && !detail}>{head || children}</Markdown>
      {detail ? (
        <div className="mt-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((v) => !v)}
            data-testid="glance-toggle"
          >
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {open ? "收起详情" : "展开详情"}
          </button>
          {open ? <Markdown isStreaming={isStreaming}>{detail}</Markdown> : null}
        </div>
      ) : null}
    </div>
  );
}
