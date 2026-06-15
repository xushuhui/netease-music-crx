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
                operation: "append",
                value: "os=pc; MUSIC_U=music-token; __csrf=csrf-token",
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

test("popup init syncs cookies before creating the offscreen document", async () => {
  const events = [];
  let messageHandler;

  globalThis.chrome = {
    contextMenus: {
      removeAll(callback) {
        callback?.();
      },
      create() {},
      update() {},
      onClicked: {
        addListener() {},
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
        addListener(listener) {
          messageHandler = listener;
        },
      },
      sendMessage(message) {
        const action = message.action ? `:${message.action}` : "";
        events.push(`send:${message.target || "runtime"}${action}`);
        if (message.target === "offscreen") {
          return Promise.resolve({
            isErr: false,
            message: "",
            userId: 42,
          });
        }
        return Promise.resolve({ isErr: false, message: "" });
      },
    },
    offscreen: {
      createDocument: async () => {
        events.push("offscreen");
      },
    },
    cookies: {
      getAll() {
        return Promise.resolve([{ name: "MUSIC_U", value: "music-token" }]);
      },
    },
    declarativeNetRequest: {
      updateSessionRules() {
        events.push("dnr");
        return Promise.resolve();
      },
    },
    commands: {
      onCommand: {
        addListener() {},
      },
    },
  };

  await import(`../src/service-worker.js?popup-init-sync-${Date.now()}`);

  const response = await new Promise((resolve) => {
    messageHandler({ action: "popupInit", params: [] }, {}, resolve);
  });

  expect(response).toEqual({ isErr: false, message: "", userId: 42 });
  expect(events).toEqual(["dnr", "offscreen", "send:offscreen:refreshStore"]);
});
