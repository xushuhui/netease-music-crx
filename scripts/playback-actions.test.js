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

function createEndedAudioStub() {
  const Base = createAudioStub();
  return class extends Base {
    constructor() {
      super();
      this._src = "";
      this.duration = 100;
      this.buffered = { length: 0 };
      this.playCalls = 0;
      globalThis.audio = this;
    }

    set src(value) {
      this._src = value;
      setTimeout(() => this.onloadedmetadata?.(), 0);
    }

    get src() {
      return this._src;
    }

    async play() {
      this.playCalls += 1;
      await super.play();
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

test("audio ended advances to the next song and keeps playback active", async () => {
  globalThis.Audio = createEndedAudioStub();
  globalThis.chrome = createChromeStub();

  const { default: api } = await import("../src/background/api.js");
  const originalApi = {
    loginRefresh: api.loginRefresh,
    getPlaylistDetail: api.getPlaylistDetail,
    getSongDetail: api.getSongDetail,
    getSongUrls: api.getSongUrls,
  };

  try {
    api.loginRefresh = async () => ({ code: 301 });
    api.getPlaylistDetail = async () => ({
      code: 200,
      playlist: { trackIds: [{ id: 1 }, { id: 2 }] },
    });
    api.getSongDetail = async (ids) => ({
      code: 200,
      songs: ids.map((id) => ({
        id,
        name: `song-${id}`,
        al: { picUrl: "" },
        ar: [],
        dt: 100,
        fee: 0,
      })),
      privileges: ids.map(() => ({ st: 0 })),
    });
    api.getSongUrls = async (ids) => ({
      code: 200,
      data: ids.map((id) => ({ url: `https://example.test/${id}.mp3` })),
    });

    const storeModule = await import(
      `../src/background/store.js?ended-next-${Date.now()}`
    );
    await storeModule.bootstrap();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.store.playing = true;
    globalThis.store.audioPlaying = true;
    globalThis.audio.paused = false;
    globalThis.audio.onpause?.();
    const playCallsBeforeEnded = globalThis.audio.playCalls;

    await globalThis.audio.onended();

    expect(globalThis.store.selectedSong.id).toBe(2);
    expect(globalThis.store.playing).toBe(true);
    expect(globalThis.audio.playCalls).toBe(playCallsBeforeEnded + 1);
  } finally {
    Object.assign(api, originalApi);
  }
});

test("login persists user identity for the next extension session", async () => {
  const writes = [];
  globalThis.Audio = createAudioStub();
  globalThis.chrome = {
    runtime: {
      sendMessage() {},
    },
    storage: {
      local: {
        get(callback) {
          callback?.({});
        },
        set(data, callback) {
          writes.push(data);
          callback?.();
        },
      },
    },
  };

  const { default: api } = await import("../src/background/api.js");
  const originalLogin = api.cellphoneLogin;

  try {
    api.cellphoneLogin = async () => ({
      code: 200,
      profile: { userId: 42, vipType: 1 },
    });

    const { login } = await import(
      `../src/background/store.js?persist-login-${Date.now()}`
    );

    await login("13000000000", "1234");

    expect(writes).toContainEqual(
      expect.objectContaining({ userId: 42, vip: true })
    );
  } finally {
    api.cellphoneLogin = originalLogin;
  }
});
