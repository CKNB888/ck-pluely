// Verifies every English UI key has a translation in each locale file.
import { readFileSync, readdirSync } from "node:fs";
const dir = new URL("../src/i18n/locales/", import.meta.url);
const en = JSON.parse(readFileSync(new URL("en.json", dir), "utf8"));
let failed = false;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const loc = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  const missing = Object.keys(en).filter((k) => typeof loc[k] !== "string" || !loc[k]);
  const extra = Object.keys(loc).filter((k) => !(k in en));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`${file}: ${missing.length} missing, ${extra.length} unused`, missing.slice(0, 20), extra.slice(0, 20));
  } else console.log(`${file}: OK (${Object.keys(en).length} keys)`);
}
process.exit(failed ? 1 : 0);
