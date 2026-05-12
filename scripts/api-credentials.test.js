const { test, expect } = require("bun:test");

test("netease api requests include cross-origin cookies", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      json: async () => ({ code: 200 }),
    };
  };

  const { default: api } = await import("../src/background/api.js");
  await api.loginRefresh();

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://music.163.com/weapi/login/token/refresh");
  expect(calls[0].options.credentials).toBe("include");
});
