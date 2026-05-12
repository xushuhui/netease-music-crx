import { sleep } from "../utils";

const RATE_LIMIT_MESSAGE = "操作频繁";
const RATE_LIMIT_RETRY_DELAY = 1000;
const RATE_LIMIT_RETRY_MAX = 3;

async function requestCloudSongs(fetchCloudSongs, limit, offset, sleepFn) {
  let retryCount = 0;

  while (true) {
    const res = await fetchCloudSongs(limit, offset);
    if (res.code === 200) {
      return res;
    }
    if (
      typeof res.message === "string" &&
      res.message.includes(RATE_LIMIT_MESSAGE) &&
      retryCount < RATE_LIMIT_RETRY_MAX
    ) {
      retryCount += 1;
      await sleepFn(RATE_LIMIT_RETRY_DELAY);
      continue;
    }
    throw new Error(res.message);
  }
}

export async function loadCloudSongsPage(
  fetchCloudSongs,
  offset = 0,
  limit = 250,
  options = {}
) {
  const { sleep: sleepFn = sleep } = options;
  const res = await requestCloudSongs(fetchCloudSongs, limit, offset, sleepFn);
  const songs = Array.isArray(res.data) ? res.data : [];
  return {
    songs,
    hasMore: !!res.hasMore && songs.length > 0,
    nextOffset: offset + songs.length,
  };
}

export async function loadAllCloudSongs(
  fetchCloudSongs,
  limit = 250,
  options = {}
) {
  const { sleep: sleepFn = sleep } = options;
  let songs = [];
  let offset = 0;

  while (true) {
    const page = await loadCloudSongsPage(fetchCloudSongs, offset, limit, {
      sleep: sleepFn,
    });
    songs = songs.concat(page.songs);
    if (!page.hasMore) {
      break;
    }
    offset = page.nextOffset;
  }

  return songs;
}
