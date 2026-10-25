// ==高亮== → <mark>（课堂答案里的关键词）。不处理代码、公式里的文本。
// 不用后行断言：旧版 macOS 的 WebKit 不支持，会导致整个页面脚本加载失败。
const RE = /==([^\s=](?:(?:(?!==)[^\n]){0,78}[^\s=])?)==/g;
const SKIP = new Set(["code", "inlineCode", "math", "inlineMath", "html"]);

export function splitMarks(value: string): any[] | null {
  RE.lastIndex = 0;
  if (!RE.test(value)) return null;
  RE.lastIndex = 0;
  const out: any[] = [];
  let last = 0;
  for (let m = RE.exec(value); m; m = RE.exec(value)) {
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
    out.push({
      type: "mark",
      data: { hName: "mark", hProperties: { className: ["ck-mark"] } },
      children: [{ type: "text", value: m[1] }],
    });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function walk(node: any) {
  if (!node || !Array.isArray(node.children) || SKIP.has(node.type)) return;
  const next: any[] = [];
  for (const c of node.children) {
    if (c.type === "text") {
      const parts = splitMarks(c.value);
      if (parts) {
        next.push(...parts);
        continue;
      }
    } else {
      walk(c);
    }
    next.push(c);
  }
  node.children = next;
}

export default function remarkMark() {
  return (tree: any) => walk(tree);
}
