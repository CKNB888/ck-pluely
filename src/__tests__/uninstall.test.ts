import { describe, expect, it } from "vitest";
import { secretAccounts } from "@/lib/uninstall";

describe("secretAccounts", () => {
  it("lists only secret variables per provider", () => {
    const acc = secretAccounts(
      [{ id: "groq", curl: "Bearer {{API_KEY}} {{MODEL}} {{TEXT}}" }],
      [{ id: "siliconflow", curl: "{{API_KEY}} {{AUTH_TOKEN}}" }]
    );
    expect(acc).toEqual(["ai:groq:api_key", "stt:siliconflow:api_key", "stt:siliconflow:auth_token"]);
  });
});
