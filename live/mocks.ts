import { vi } from "vitest";
// Run the app's real TS network code in Node: Tauri HTTP plugin → global fetch.
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (u: string, i: any) => {
    const { connectTimeout: _c, ...rest } = i || {};
    return globalThis.fetch(u, rest);
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: async () => { throw new Error("no tauri"); } }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
