const { test, expect } = require("bun:test");

test("playSong retries lower bitrates when the preferred url is empty", async () => {
  globalThis.Audio = class {
    constructor() {
      this.volume = 1;
      this._src = "";
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onloadedmetadata?.());
    }

    get src() {
      return this._src;
    }

    play() {}

    pause() {}
  };

  globalThis.chrome = {
    runtime: {
      sendMessage() {},
    },
    storage: {
      local: {
        get(callback) {
          callback({});
        },
        set(_data, callback) {
          callback?.();
        },
      },
    },
  };

  const { default: api } = await import("../src/background/api.js");
  const originalApi = {
    getSongDetail: api.getSongDetail,
    getSongUrls: api.getSongUrls,
  };

  try {
    const requestedBitrates = [];
    api.getSongDetail = async () => ({
      code: 200,
      songs: [
        {
          id: 215382,
          name: "雨过后的风景",
          al: { picUrl: "" },
          ar: [],
          dt: 100,
          fee: 0,
        },
      ],
      privileges: [{ st: 0 }],
    });
    api.getSongUrls = async (_ids, br) => {
      requestedBitrates.push(br);
      return {
        code: 200,
        data: [{ url: br === 128000 ? "https://example.test/song.mp3" : null }],
      };
    };

    const storeModule = await import(
      "../src/background/store.js?song-url-fallback"
    );
    const { default: store, playSong } = storeModule;
    Object.assign(store, {
      playing: false,
      vip: false,
      selectedPlaylist: {
        id: 1,
        normalIndexes: [215382],
        shuffleIndexes: [215382],
        invalidIndexes: [],
      },
    });

    const change = await playSong(215382);

    expect(requestedBitrates).toEqual([999000, 320000, 128000]);
    expect(change.selectedSong.id).toBe(215382);
    expect(globalThis.audio.src).toBe("https://example.test/song.mp3");
  } finally {
    Object.assign(api, originalApi);
  }
});

test("playNext skips unavailable songs without logging console errors", async () => {
  globalThis.Audio = class {
    constructor() {
      this.volume = 1;
      this._src = "";
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onloadedmetadata?.());
    }

    get src() {
      return this._src;
    }

    play() {}

    pause() {}
  };

  globalThis.chrome = {
    runtime: {
      sendMessage() {},
    },
    storage: {
      local: {
        get(callback) {
          callback({});
        },
        set(_data, callback) {
          callback?.();
        },
      },
    },
  };

  const errorCalls = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    errorCalls.push(args);
  };

  const { default: api } = await import("../src/background/api.js");
  const originalApi = {
    getSongDetail: api.getSongDetail,
    getSongUrls: api.getSongUrls,
  };

  try {
    api.getSongDetail = async (ids) => ({
      code: 200,
      songs: ids.map((id) => ({
        id,
        name: id === 223801 ? "猜不透" : "雨过后的风景",
        al: { picUrl: "" },
        ar: [],
        dt: 100,
        fee: 0,
      })),
      privileges: ids.map(() => ({ st: 0 })),
    });
    api.getSongUrls = async (ids, br) => ({
      code: 200,
      data: [
        {
          url:
            ids[0] === 215382 && br === 128000
              ? "https://example.test/song.mp3"
              : null,
        },
      ],
    });

    const storeModule = await import(
      "../src/background/store.js?skip-unavailable-song"
    );
    const { default: store, playNext } = storeModule;
    Object.assign(store, {
      playing: false,
      vip: false,
      selectedSong: { id: 215382 },
      selectedPlaylist: {
        id: 1,
        normalIndexes: [215382, 223801],
        shuffleIndexes: [215382, 223801],
        invalidIndexes: [],
      },
    });

    const change = await playNext();

    expect(change.selectedSong.id).toBe(215382);
    expect(errorCalls).toHaveLength(0);
  } finally {
    Object.assign(api, originalApi);
    console.error = originalConsoleError;
  }
});
