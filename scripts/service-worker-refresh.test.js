const { test, expect } = require("bun:test");

test("context menu refresh forwards refreshed state to popup", async () => {
  let clickHandler;
  const popupMessages = [];
  const offscreenMessages = [];
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
          offscreenMessages.push(message);
          return Promise.resolve({
            isErr: false,
            message: "",
            userId: 42,
            playlists: [],
          });
        }
        popupMessages.push(message);
        return Promise.resolve({ isErr: false, message: "" });
      },
    },
    offscreen: {
      createDocument: async () => {},
    },
    cookies: {
      getAll(query) {
        cookieQueries.push(query);
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

  await import("../src/service-worker.js");

  clickHandler({ menuItemId: "refreshStore" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(cookieQueries).toEqual([{ url: "https://music.163.com/" }]);
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
                operation: "append",
                value: "os=pc; MUSIC_U=music-token; __csrf=csrf-token",
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
  expect(offscreenMessages).toEqual([
    {
      target: "offscreen",
      action: "refreshStore",
      params: [],
    },
  ]);
  expect(popupMessages).toEqual([
    {
      target: "popup",
      topic: "sync",
      change: {
        isErr: false,
        message: "",
        userId: 42,
        playlists: [],
      },
    },
  ]);
});
