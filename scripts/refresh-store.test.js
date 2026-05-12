const { test, expect } = require("bun:test");

test("refreshStore returns refreshed popup login state", async () => {
  globalThis.Audio = class {
    constructor() {
      this.volume = 1;
      this.playing = false;
    }

    play() {
      this.playing = true;
    }

    pause() {
      this.playing = false;
    }
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
    loginRefresh: api.loginRefresh,
    getUser: api.getUser,
    getRecommendResource: api.getRecommendResource,
    getUserPlaylist: api.getUserPlaylist,
    getPlaylistDetail: api.getPlaylistDetail,
    getSongDetail: api.getSongDetail,
    getSongUrls: api.getSongUrls,
  };

  try {
    api.loginRefresh = async () => ({ code: 200 });
    api.getUser = async () => ({
      code: 200,
      profile: { userId: 42, vipType: 1 },
    });
    api.getRecommendResource = async () => ({ code: 200, recommend: [] });
    api.getUserPlaylist = async () => ({ code: 200, playlist: [] });
    api.getPlaylistDetail = async () => ({
      code: 200,
      playlist: { trackIds: [{ id: 123 }] },
    });
    api.getSongDetail = async () => ({
      code: 200,
      songs: [
        {
          id: 123,
          name: "song",
          album: { picUrl: "" },
          artists: [],
          duration: 100,
          fee: 0,
        },
      ],
      privileges: [{ st: 0 }],
    });
    api.getSongUrls = async () => ({
      code: 200,
      data: [{ url: "https://example.test/song.mp3" }],
    });

    const { refreshStore } = await import("../src/background/store.js");

    const popupData = await refreshStore();

    expect(popupData.userId).toBe(42);
    expect(popupData.vip).toBe(true);
    expect(popupData.playlists).toHaveLength(7);
  } finally {
    Object.assign(api, originalApi);
  }
});
