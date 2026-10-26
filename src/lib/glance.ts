/**
 * 扫一眼版式：结论一句 + 最多 4 条要点放在上面，其余细节折叠。
 * 只按行切，保证流式输出时「上面那部分」是稳定前缀，不会跳动。
 */
export function splitGlance(md: string, maxPoints = 4): { head: string; detail: string } {
  const lines = md.split("\n");
  let i = 0;
  // 跳过开头空行，取第一段（结论）
  while (i < lines.length && !lines[i].trim()) i++;
  const inFence = (k: number) => lines.slice(0, k).filter((l) => l.trim().startsWith("```")).length % 2 === 1;
  while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d+\.)\s/.test(lines[i])) i++;
  // 再取紧接着的要点列表（最多 maxPoints 条，可隔一个空行）
  let j = i;
  while (j < lines.length && !lines[j].trim()) j++;
  let points = 0;
  while (j < lines.length) {
    const l = lines[j];
    if (/^\s{0,1}([-*+]|\d+\.)\s/.test(l)) {
      if (points === maxPoints) break;
      points++;
      j++;
    } else if (/^\s{2,}\S/.test(l) && points > 0) {
      j++; // 列表项的续行
    } else break;
  }
  const cut = points > 0 ? j : i;
  if (inFence(cut)) return { head: md, detail: "" };
  const head = lines.slice(0, cut).join("\n").trimEnd();
  const detail = lines.slice(cut).join("\n").trim();
  // 没有要点列表时，只有较长的回答才折叠
  if (points === 0 && detail.length < 300) return { head: md, detail: "" };
  return { head, detail };
}
