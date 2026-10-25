// Lists likely hardcoded user-facing English in TSX (not wrapped in t()).
import fs from "fs"; import path from "path";
const out=[]; const walk=d=>{for(const f of fs.readdirSync(d)){const p=path.join(d,f);
 if(fs.statSync(p).isDirectory()) walk(p); else if(/\.tsx$/.test(f)) scan(p);}};
const pats=[/>\s*([A-Z][A-Za-z ,.'!?-]{2,})\s*</g,/\b(placeholder|title|aria-label|label|description)=\"([A-Za-z][^"]{2,})\"/g,/toast\w*\(\s*["'`]([A-Za-z][^"'`]+)/g,/setError\(\s*["'`]([A-Za-z][^"'`]+)/g];
function scan(p){fs.readFileSync(p,"utf8").split("\n").forEach((l,i)=>{if(/^\s*(\/\/|\*|import)/.test(l))return;
 for(const r of pats){r.lastIndex=0;let m;while((m=r.exec(l))){const s=m[m.length-1];if(/^(CK|Pluely|API|URL|JSON|Groq|OpenAI|ESC|Ctrl|Cmd|CKNB)$/.test(s.trim()))continue;out.push(`${p}:${i+1}: ${s.trim()}`)}}})}
walk("src"); console.log(out.join("\n")); console.error(`${out.length} candidates`);
