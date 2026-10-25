import { describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA,
  buildSettings,
  diffSettings,
  migrateSettings,
} from "@/lib/backup/format";
import { decryptSecrets, encryptSecrets } from "@/lib/backup/crypto";

// v1.0.x 的 localStorage 原样导出（手工备份 / 旧格式）
const V1_FIXTURE = {
  theme: "dark",
  pluely_api_enabled: "false",
  autostart_initialized: "true",
  curl_selected_ai_provider: JSON.stringify({ provider: "groq", variables: { model: "openai/gpt-oss-20b", api_key: "gsk_fixture_not_real" } }),
  shortcuts: { toggle: "CmdOrCtrl+Backslash" },
  response_settings: '{"length":"short"}',
};

// v2.0.0 起的结构
const V2_FIXTURE = {
  format: 2,
  storage: { theme: "light", ck_ui_style: "panel", ck_class_subject: "math", ck_font_scale: "115" },
};

describe("backup settings migrations", () => {
  it("upgrades a v1.0.x flat dump", () => {
    const r = migrateSettings(1, V1_FIXTURE);
    expect(r.steps).toEqual([1]);
    expect(r.settings.format).toBe(BACKUP_SCHEMA);
    expect(r.settings.storage.theme).toBe("dark");
    expect(r.settings.storage.pluely_api_enabled).toBeUndefined();
    expect(r.settings.storage.autostart_initialized).toBeUndefined();
    expect(r.settings.storage.shortcuts).toBe('{"toggle":"CmdOrCtrl+Backslash"}');
    const sel = JSON.parse(r.settings.storage.curl_selected_ai_provider);
    expect(sel.variables.api_key).toBe("");
    expect(sel.variables.model).toBe("openai/gpt-oss-20b");
  });

  it("passes current schema through", () => {
    const r = migrateSettings(2, V2_FIXTURE);
    expect(r.steps).toEqual([]);
    expect(r.settings.storage).toEqual(V2_FIXTURE.storage);
  });

  it("accepts newer schemas forward-compatibly", () => {
    const r = migrateSettings(7, { format: 7, storage: { theme: "dark", future_key: "x" }, extra: 1 });
    expect(r.newer).toBe(true);
    expect(r.settings.storage.future_key).toBe("x");
  });

  it("rejects garbage", () => {
    expect(() => migrateSettings(0, {})).toThrow();
    expect(() => migrateSettings(2, { nope: 1 })).toThrow();
  });
});

describe("backup build / diff", () => {
  it("strips secrets and device-only keys on export", () => {
    const { settings, strippedSecrets } = buildSettings({
      theme: "dark",
      ck_bar_pos: "10,10",
      curl_selected_stt_provider: JSON.stringify({ provider: "groq", variables: { api_key: "k1", model: "whisper" } }),
    });
    expect(settings.storage.ck_bar_pos).toBeUndefined();
    expect(JSON.stringify(settings)).not.toContain("k1");
    expect(strippedSecrets["local:curl_selected_stt_provider:api_key"]).toBe("k1");
  });

  it("previews replace vs merge", () => {
    const cur = { a: "1", b: "2", ck_bar_pos: "x" };
    const inc = { a: "1", b: "3", c: "4" };
    const rep = diffSettings(cur, inc, false);
    expect(rep).toEqual({ added: ["c"], changed: ["b"], removed: [], unchanged: 1 });
    const cur2 = { ...cur, old: "z" };
    expect(diffSettings(cur2, inc, false).removed).toEqual(["old"]);
    expect(diffSettings(cur2, inc, true).removed).toEqual([]);
  });
});

describe("secret encryption", () => {
  it("round-trips and rejects a wrong password", async () => {
    const enc = await encryptSecrets({ "keychain:ai:groq:api_key": "secret-value" }, "correct horse", 1000);
    expect(enc).not.toContain("secret-value");
    expect(await decryptSecrets(enc, "correct horse")).toEqual({ "keychain:ai:groq:api_key": "secret-value" });
    await expect(decryptSecrets(enc, "wrong pass")).rejects.toThrow("口令不正确");
    await expect(encryptSecrets({}, "123")).rejects.toThrow();
  });
});
