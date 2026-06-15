const { test, expect } = require("bun:test");

test("service worker falls back to domain cookies when url query misses MUSIC_U", async () => {
  let clickHandler;
  const cookieQueries = [];
  const sessionRuleUpdates = [];

  globalThis.chrome = {
    contextMenus: {
      removeAll(callback) {
        callback?.();
      },
      create() {},
      update() {},
      onClicked: {
        addListener(listener) {
          clickHandler = listener;
        },
      },
    },
    runtime: {
      id: "test-extension",
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
      getContexts: async () => [],
      onInstalled: {
        addListener() {},
      },
      onMessage: {
        addListener() {},
      },
      sendMessage(message) {
        if (message.target === "offscreen") {
          return Promise.resolve({
            isErr: false,
            message: "",
            userId: 42,
            playlists: [],
          });
        }
        return Promise.resolve({ isErr: false, message: "" });
      },
    },
    offscreen: {
      createDocument: async () => {},
    },
    cookies: {
      getAll(query) {
        cookieQueries.push(query);
        if (query.url) {
          return Promise.resolve([{ name: "__csrf", value: "csrf-token" }]);
        }
        return Promise.resolve([
          { name: "MUSIC_U", value: "music-token" },
          { name: "__csrf", value: "csrf-token" },
        ]);
      },
    },
    declarativeNetRequest: {
      updateSessionRules(update) {
        sessionRuleUpdates.push(update);
        return Promise.resolve();
      },
    },
    commands: {
      onCommand: {
        addListener() {},
      },
    },
  };

  await import(`../src/service-worker.js?t=${Date.now()}`);

  clickHandler({ menuItemId: "refreshStore" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(cookieQueries).toEqual([
    { url: "https://music.163.com/" },
    { domain: ".music.163.com" },
    { domain: "music.163.com" },
  ]);
  expect(sessionRuleUpdates).toEqual([
    {
      removeRuleIds: [10000, 10001],
      addRules: [
        {
          id: 10000,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "Origin",
                operation: "set",
                value: "https://music.163.com",
              },
              {
                header: "Referer",
                operation: "set",
                value: "https://music.163.com",
              },
            ],
            responseHeaders: [
              {
                header: "Access-Control-Allow-Origin",
                operation: "set",
                value: "chrome-extension://test-extension",
              },
              {
                header: "Access-Control-Allow-Credentials",
                operation: "set",
                value: "true",
              },
            ],
          },
          condition: {
            excludedInitiatorDomains: ["music.163.com"],
            resourceTypes: ["xmlhttprequest"],
            urlFilter: "||music.163.com/weapi/",
          },
        },
        {
          id: 10001,
          priority: 2,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "cookie",
                operation: "set",
                value: "os=pc; __csrf=csrf-token; MUSIC_U=music-token",
              },
            ],
          },
          condition: {
            excludedInitiatorDomains: ["music.163.com"],
            resourceTypes: ["xmlhttprequest"],
            urlFilter: "||music.163.com/",
          },
        },
      ],
    },
  ]);
});

test("service worker finds host-only music.163.com login cookies", async () => {
  let clickHandler;
  const cookieQueries = [];
  const sessionRuleUpdates = [];

  globalThis.chrome = {
    contextMenus: {
      removeAll(callback) {
        callback?.();
      },
      create() {},
      update() {},
      onClicked: {
        addListener(listener) {
          clickHandler = listener;
        },
      },
    },
    runtime: {
      id: "test-extension",
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
      getContexts: async () => [],
      onInstalled: {
        addListener() {},
      },
      onMessage: {
        addListener() {},
      },
      sendMessage(message) {
        if (message.target === "offscreen") {
          return Promise.resolve({
            isErr: false,
            message: "",
            userId: 42,
            playlists: [],
          });
        }
        return Promise.resolve({ isErr: false, message: "" });
      },
    },
    offscreen: {
      createDocument: async () => {},
    },
    cookies: {
      getAll(query) {
        cookieQueries.push(query);
        if (query.domain === "music.163.com") {
          return Promise.resolve([{ name: "MUSIC_U", value: "music-token" }]);
        }
        return Promise.resolve([]);
      },
    },
    declarativeNetRequest: {
      updateSessionRules(update) {
        sessionRuleUpdates.push(update);
        return Promise.resolve();
      },
    },
    commands: {
      onCommand: {
        addListener() {},
      },
    },
  };

  await import(`../src/service-worker.js?host-cookie-${Date.now()}`);

  clickHandler({ menuItemId: "refreshStore" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(cookieQueries).toEqual([
    { url: "https://music.163.com/" },
    { domain: ".music.163.com" },
    { domain: "music.163.com" },
  ]);
  expect(sessionRuleUpdates[0].addRules[1].action.requestHeaders[0]).toEqual({
    header: "cookie",
    operation: "set",
    value: "os=pc; MUSIC_U=music-token",
  });
});
