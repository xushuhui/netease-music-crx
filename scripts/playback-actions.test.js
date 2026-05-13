const { test, expect } = require("bun:test");

function createAudioStub() {
  return class {
    constructor() {
      this.volume = 1;
      this.paused = true;
      this.ended = false;
      this.currentTime = 0;
    }

    async play() {
      this.paused = false;
      this.onplay?.();
    }

    pause() {
      this.paused = true;
      this.onpause?.();
    }
  };
}

function createChromeStub() {
  return {
    runtime: {
      sendMessage() {},
    },
    storage: {
      local: {
        get(callback) {
          callback?.({});
        },
        set(_data, callback) {
          callback?.();
        },
      },
    },
  };
}

function createRuntimeBusChromeStub() {
  const messageListeners = [];
  const clickListeners = [];
  const installedListeners = [];

  return {
    contextMenus: {
      removeAll(callback) {
        callback?.();
      },
      create() {},
      update() {},
      onClicked: {
        addListener(listener) {
          clickListeners.push(listener);
        },
      },
    },
    runtime: {
      getManifest() {
        return { manifest_version: 3 };
      },
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
      getContexts: async () => [{ contextType: "OFFSCREEN_DOCUMENT" }],
      onInstalled: {
        addListener(listener) {
          installedListeners.push(listener);
        },
      },
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener);
        },
      },
      async sendMessage(message) {
        for (const listener of messageListeners) {
          const response = await new Promise((resolve) => {
            let resolved = false;
            const sendResponse = (value) => {
              resolved = true;
              resolve(value);
            };
            const result = listener(message, {}, sendResponse);
            if (result !== true && !resolved) {
              resolve(undefined);
            }
          });
          if (typeof response !== "undefined") {
            return response;
          }
        }
        return undefined;
      },
    },
    storage: {
      local: {
        get(callback) {
          callback?.({});
        },
        set(_data, callback) {
          callback?.();
        },
      },
    },
    commands: {
      onCommand: {
        addListener() {},
      },
    },
    __click(menuItemId) {
      clickListeners.forEach((listener) => listener({ menuItemId }));
    },
    __listenerCounts() {
      return {
        click: clickListeners.length,
        message: messageListeners.length,
      };
    },
    __triggerInstalled() {
      installedListeners.forEach((listener) => listener());
    },
  };
}

test("togglePlaying pauses an active audio element", async () => {
  globalThis.Audio = createAudioStub();
  globalThis.chrome = createChromeStub();

  const storeModule = await import(
    `../src/background/store.js?toggle-playing-${Date.now()}`
  );

  const audio = globalThis.audio;
  audio.paused = false;

  const result = await storeModule.togglePlaying();

  expect(audio.paused).toBe(true);
  expect(result).toEqual({ audioPlaying: false, playing: false });
});

test("toggleMute mutes and restores the previous volume", async () => {
  globalThis.Audio = createAudioStub();
  globalThis.chrome = createChromeStub();

  const storeModule = await import(
    `../src/background/store.js?toggle-mute-${Date.now()}`
  );

  const first = storeModule.toggleMute();
  const second = storeModule.toggleMute();

  expect(first).toEqual({ volume: 0, volumeMute: 1 });
  expect(second).toEqual({ volume: 1, volumeMute: null });
  expect(globalThis.audio.volume).toBe(1);
});

test("mv3 service worker does not duplicate context menu listeners on install", async () => {
  globalThis.Audio = createAudioStub();
  globalThis.chrome = createRuntimeBusChromeStub();

  await import(`../src/service-worker.js?service-worker-runtime-${Date.now()}`);

  expect(globalThis.chrome.__listenerCounts()).toEqual({
    click: 1,
    message: 1,
  });

  globalThis.chrome.__triggerInstalled();

  expect(globalThis.chrome.__listenerCounts()).toEqual({
    click: 1,
    message: 1,
  });
});
