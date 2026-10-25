// Regenerates src/lib/functions/zh-t2s.data.ts from OpenCC (Apache-2.0).
// Usage: npx -p opencc-js@1 node scripts/gen-zh-t2s.mjs   (opencc-js is not a dependency)
import * as OpenCC from "opencc-js";
import fs from "fs";
const t = OpenCC.Converter({ from: "t", to: "cn" });
const tw = OpenCC.Converter({ from: "tw", to: "cn" });
// Characters of GB2312 are valid Simplified Chinese: never rewrite them
// (OpenCC's t→cn would e.g. turn 么 into 幺).
const gb = new Set();
const dec = new TextDecoder("gb18030");
for (let hi = 0xb0; hi <= 0xf7; hi++)
  for (let lo = 0xa1; lo <= 0xfe; lo++) gb.add(dec.decode(new Uint8Array([hi, lo])));
let from = "", to = "";
for (let cp = 0x3400; cp <= 0x9fff; cp++) {
  const ch = String.fromCodePoint(cp);
  let s = t(ch);
  if (s === ch) s = tw(ch);
  if (s !== ch && s.length === 1 && !gb.has(ch)) { from += ch; to += s; }
}
// GB2312 also contains a few characters that in practice only appear in
// Traditional output; map them anyway (乾坤/乾隆 are rare in meetings).
for (const [a, b] of [["後", "后"], ["於", "于"], ["乾", "干"], ["隻", "只"], ["衹", "只"]]) {
  if (!from.includes(a)) { from += a; to += b; }
}
const out = `// 繁体 → 简体 单字映射（由 OpenCC 字典生成，Apache-2.0，https://github.com/BYVoid/OpenCC）。
// 仅在 Whisper 输出繁体时使用；逐字替换，体积约 18 KB。
// 由 scripts/gen-zh-t2s.mjs 生成，请勿手改。
export const T2S_FROM =
  ${JSON.stringify(from)};
export const T2S_TO =
  ${JSON.stringify(to)};
`;
fs.writeFileSync(new URL("../src/lib/functions/zh-t2s.data.ts", import.meta.url), out);
console.log(`${from.length} characters`);
