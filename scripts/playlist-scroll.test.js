const { test, expect } = require("bun:test");

test("shouldScrollSelectedSong only scrolls after explicit target request", async () => {
  const { shouldScrollSelectedSong } = await import(
    "../src/popup/playlistScroll.js"
  );

  expect(shouldScrollSelectedSong(1001, "cloud", null)).toBe(false);
  expect(
    shouldScrollSelectedSong(1001, "cloud", {
      playlistId: null,
      songId: null,
    })
  ).toBe(false);
  expect(
    shouldScrollSelectedSong(1001, "cloud", {
      playlistId: "cloud",
      songId: null,
    })
  ).toBe(true);
  expect(
    shouldScrollSelectedSong(1001, "cloud", {
      playlistId: null,
      songId: 1001,
    })
  ).toBe(true);
});

test("getPlaylistScrollTarget skips auto-scroll for cloud playlist", async () => {
  const { getPlaylistScrollTarget } = await import(
    "../src/popup/playlistScroll.js"
  );
  const { PLAYLIST_TYPE } = await import("../src/utils.js");

  expect(getPlaylistScrollTarget(null)).toEqual({
    playlistId: null,
    songId: null,
  });
  expect(
    getPlaylistScrollTarget({
      id: "cloud",
      type: PLAYLIST_TYPE.CLOUD,
    })
  ).toEqual({
    playlistId: null,
    songId: null,
  });
  expect(
    getPlaylistScrollTarget({
      id: "daily",
      type: PLAYLIST_TYPE.TOP,
    })
  ).toEqual({
    playlistId: "daily",
    songId: null,
  });
});

test("syncRefsById keeps existing refs when appending songs", async () => {
  const { syncRefsById } = await import("../src/popup/playlistScroll.js");

  const refs = {};
  const ref1 = { current: { id: 1 } };
  const ref2 = { current: { id: 2 } };
  const createRef = () => ({ current: null });

  const nextRefs = syncRefsById(
    Object.assign(refs, {
      1: ref1,
      2: ref2,
    }),
    [{ id: 1 }, { id: 2 }, { id: 3 }],
    createRef
  );

  expect(nextRefs).toBe(refs);
  expect(nextRefs[1]).toBe(ref1);
  expect(nextRefs[2]).toBe(ref2);
  expect(nextRefs[3]).not.toBeUndefined();
  expect(nextRefs[3]).not.toBe(ref1);
  expect(nextRefs[3]).not.toBe(ref2);
});

test("isElementInScrollContainerViewport checks against scroll container", async () => {
  const { isElementInScrollContainerViewport } = await import(
    "../src/popup/playlistScroll.js"
  );

  const container = {
    getBoundingClientRect() {
      return {
        top: 100,
        bottom: 500,
        left: 0,
        right: 300,
      };
    },
  };

  const visibleElement = {
    getBoundingClientRect() {
      return {
        top: 120,
        bottom: 300,
        left: 0,
        right: 300,
      };
    },
  };
  const hiddenElement = {
    getBoundingClientRect() {
      return {
        top: 20,
        bottom: 80,
        left: 0,
        right: 300,
      };
    },
  };

  expect(isElementInScrollContainerViewport(visibleElement, container)).toBe(
    true
  );
  expect(isElementInScrollContainerViewport(hiddenElement, container)).toBe(
    false
  );
});

test("getCloudScrollRestoreTop restores persisted absolute position with bounds", async () => {
  const { getCloudScrollRestoreTop } = await import(
    "../src/popup/playlistScroll.js"
  );

  expect(
    getCloudScrollRestoreTop(null, { scrollTop: 0, scrollHeight: 0 })
  ).toBeNull();
  expect(
    getCloudScrollRestoreTop(
      {
        playlistId: 30,
        scrollTop: 980,
        scrollHeight: 1400,
        clientHeight: 400,
      },
      {
        scrollTop: 972,
        scrollHeight: 1400,
      }
    )
  ).toBe(980);
  expect(
    getCloudScrollRestoreTop(
      {
        playlistId: 30,
        scrollTop: 1200,
        scrollHeight: 2000,
        clientHeight: 400,
      },
      {
        scrollTop: 108,
        scrollHeight: 824,
      }
    )
  ).toBe(424);
});

test("getCloudScrollRestoreTop restores persisted position after popup remount", async () => {
  const { getCloudScrollRestoreTop } = await import(
    "../src/popup/playlistScroll.js"
  );

  expect(
    getCloudScrollRestoreTop(
      {
        playlistId: 30,
        scrollTop: 23204,
        scrollHeight: 24004,
        clientHeight: 400,
      },
      {
        scrollTop: 0,
        scrollHeight: 24004,
      }
    )
  ).toBe(23204);
});

test("shouldRestorePersistedCloudScroll only restores before user starts scrolling", async () => {
  const { shouldRestorePersistedCloudScroll } = await import(
    "../src/popup/playlistScroll.js"
  );

  const snapshot = {
    playlistId: 30,
    scrollTop: 1000,
    scrollHeight: 2400,
    clientHeight: 400,
  };

  expect(shouldRestorePersistedCloudScroll(null, 0, false)).toBe(false);
  expect(shouldRestorePersistedCloudScroll(snapshot, 0, false)).toBe(true);
  expect(shouldRestorePersistedCloudScroll(snapshot, 8, false)).toBe(false);
  expect(shouldRestorePersistedCloudScroll(snapshot, 0, true)).toBe(false);
});

test("getRetainedScrollTop keeps previous top when append changed top unexpectedly", async () => {
  const { getRetainedScrollTop } = await import(
    "../src/popup/playlistScroll.js"
  );

  expect(getRetainedScrollTop(null, 100)).toBeNull();
  expect(getRetainedScrollTop(100, 101)).toBeNull();
  expect(getRetainedScrollTop(100, 220)).toBe(100);
});

test("shouldRetainScrollAfterAppend waits until songs are appended", async () => {
  const { shouldRetainScrollAfterAppend } = await import(
    "../src/popup/playlistScroll.js"
  );

  expect(shouldRetainScrollAfterAppend(null, 20)).toBe(false);
  expect(
    shouldRetainScrollAfterAppend(
      {
        songsLength: 20,
        scrollTop: 138,
      },
      20
    )
  ).toBe(false);
  expect(
    shouldRetainScrollAfterAppend(
      {
        songsLength: 20,
        scrollTop: 138,
      },
      30
    )
  ).toBe(true);
});

test("getAppendedPageScrollTop moves to the first appended song", async () => {
  const { getAppendedPageScrollTop } = await import(
    "../src/popup/playlistScroll.js"
  );

  expect(getAppendedPageScrollTop(null, 20, 48)).toBeNull();
  expect(
    getAppendedPageScrollTop(
      {
        songsLength: 20,
      },
      20,
      48
    )
  ).toBeNull();
  expect(
    getAppendedPageScrollTop(
      {
        songsLength: 20,
      },
      30,
      48
    )
  ).toBe(960);
});

test("getVirtualSongWindow renders only visible rows with overscan spacers", async () => {
  const { getVirtualSongWindow } = await import(
    "../src/popup/playlistScroll.js"
  );

  expect(
    getVirtualSongWindow({
      total: 100,
      scrollTop: 240,
      viewportHeight: 240,
      rowHeight: 48,
      overscan: 2,
    })
  ).toEqual({
    start: 3,
    end: 12,
    topSpacerHeight: 144,
    bottomSpacerHeight: 4224,
  });
});

test("getVirtualSongWindow clamps small and invalid lists", async () => {
  const { getVirtualSongWindow } = await import(
    "../src/popup/playlistScroll.js"
  );

  expect(
    getVirtualSongWindow({
      total: 3,
      scrollTop: 999,
      viewportHeight: 240,
      rowHeight: 48,
      overscan: 2,
    })
  ).toEqual({
    start: 0,
    end: 3,
    topSpacerHeight: 0,
    bottomSpacerHeight: 0,
  });

  expect(
    getVirtualSongWindow({
      total: 100,
      scrollTop: 0,
      viewportHeight: 240,
      rowHeight: 0,
      overscan: 2,
    })
  ).toEqual({
    start: 0,
    end: 100,
    topSpacerHeight: 0,
    bottomSpacerHeight: 0,
  });
});
