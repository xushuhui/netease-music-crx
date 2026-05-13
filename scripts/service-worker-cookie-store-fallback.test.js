const { test, expect } = require("bun:test");

test("service worker falls back to cookie store queries when default store misses MUSIC_U", async () => {
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
        if (query.storeId === "profile-main") {
          return Promise.resolve([{ name: "MUSIC_U", value: "music-token" }]);
        }
        return Promise.resolve([]);
      },
      getAllCookieStores() {
        return Promise.resolve([{ id: "profile-main", tabIds: [] }]);
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
    { url: "https://music.163.com/", storeId: "profile-main" },
  ]);
  expect(sessionRuleUpdates).toEqual([
    {
      removeRuleIds: [10001],
      addRules: [
        {
          id: 10001,
          priority: 2,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "cookie",
                operation: "set",
                value: "os=pc; MUSIC_U=music-token",
              },
            ],
          },
          condition: {
            urlFilter: "||music.163.com/",
            resourceTypes: ["xmlhttprequest"],
          },
        },
      ],
    },
  ]);
});
