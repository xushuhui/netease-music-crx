const { test, expect } = require("bun:test");

test("loadAllCloudSongs paginates until hasMore is false", async () => {
  const calls = [];
  const { loadAllCloudSongs } = await import("../src/background/cloud.js");

  const songs = await loadAllCloudSongs(async (limit, offset) => {
    calls.push({ limit, offset });
    if (offset === 0) {
      return {
        code: 200,
        data: [{ songId: 1 }, { songId: 2 }],
        hasMore: true,
      };
    }
    return {
      code: 200,
      data: [{ songId: 3 }],
      hasMore: false,
    };
  }, 2);

  expect(songs).toEqual([{ songId: 1 }, { songId: 2 }, { songId: 3 }]);
  expect(calls).toEqual([
    { limit: 2, offset: 0 },
    { limit: 2, offset: 2 },
  ]);
});

test("loadCloudSongsPage returns page metadata", async () => {
  const { loadCloudSongsPage } = await import("../src/background/cloud.js");

  const page = await loadCloudSongsPage(
    async (limit, offset) => ({
      code: 200,
      data: [{ songId: offset + 1 }, { songId: offset + 2 }],
      hasMore: true,
    }),
    4,
    2
  );

  expect(page).toEqual({
    songs: [{ songId: 5 }, { songId: 6 }],
    hasMore: true,
    nextOffset: 6,
  });
});

test("loadAllCloudSongs retries when cloud api is rate limited", async () => {
  const waits = [];
  let callCount = 0;
  const { loadAllCloudSongs } = await import("../src/background/cloud.js");

  const songs = await loadAllCloudSongs(
    async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          code: 509,
          message: "操作频繁，请稍候再试",
        };
      }
      return {
        code: 200,
        data: [{ songId: 1 }],
        hasMore: false,
      };
    },
    250,
    {
      sleep: async (ms) => {
        waits.push(ms);
      },
    }
  );

  expect(songs).toEqual([{ songId: 1 }]);
  expect(callCount).toBe(2);
  expect(waits).toEqual([1000]);
});
