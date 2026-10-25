import { describe, it, expect } from "vitest";
import { urlFromCurl } from "@/lib/functions/net";
describe("urlFromCurl", () => {
  it("extracts origin", () => {
    expect(urlFromCurl("curl https://api.groq.com/openai/v1/chat/completions \\\n -H x")).toBe("https://api.groq.com/");
    expect(urlFromCurl('curl "{{BASE_URL}}/v1"', {})).toBeUndefined();
    expect(urlFromCurl("curl https://{{HOST}}:8443/v1", { HOST: "a.b" })).toBe("https://a.b:8443/");
  });
});
