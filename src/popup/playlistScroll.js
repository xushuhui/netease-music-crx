import { PLAYLIST_TYPE } from "../utils";

export function shouldScrollSelectedSong(
  selectedSongId,
  selectedPlaylistId,
  scrollTarget
) {
  if (!selectedSongId) {
    return false;
  }
  if (!scrollTarget) {
    return false;
  }
  return (
    scrollTarget.playlistId === selectedPlaylistId ||
    scrollTarget.songId === selectedSongId
  );
}

export function getRestoredScrollTop(scrollSnapshot) {
  if (!scrollSnapshot) {
    return null;
  }
  return scrollSnapshot.scrollTop;
}

export function getPlaylistScrollTarget(playlist) {
  if (!playlist || playlist.type === PLAYLIST_TYPE.CLOUD) {
    return {
      playlistId: null,
      songId: null,
    };
  }
  return {
    playlistId: playlist.id,
    songId: null,
  };
}

export function syncRefsById(prevRefs, list, createRef) {
  const nextIds = new Set(list.map((item) => item.id));
  Object.keys(prevRefs).forEach((id) => {
    if (!nextIds.has(Number(id)) && !nextIds.has(id)) {
      delete prevRefs[id];
    }
  });
  list.forEach((cur) => {
    prevRefs[cur.id] = prevRefs[cur.id] || createRef();
  });
  return prevRefs;
}

export function isElementInScrollContainerViewport(el, container) {
  if (!el) {
    return true;
  }
  if (!container) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }
  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return (
    elRect.top >= containerRect.top &&
    elRect.left >= containerRect.left &&
    elRect.bottom <= containerRect.bottom &&
    elRect.right <= containerRect.right
  );
}

export function getCloudScrollRestoreTop(scrollSnapshot, currentState) {
  if (!scrollSnapshot) {
    return null;
  }
  const maxScrollTop = Math.max(
    (currentState.scrollHeight || 0) - (scrollSnapshot.clientHeight || 0),
    0
  );
  const nextScrollTop = Math.max(
    Math.min(scrollSnapshot.scrollTop || 0, maxScrollTop),
    0
  );
  if (Math.abs(nextScrollTop - (currentState.scrollTop || 0)) <= 2) {
    return null;
  }
  return nextScrollTop;
}

export function shouldRestorePersistedCloudScroll(
  scrollSnapshot,
  currentScrollTop,
  userHasScrolled
) {
  if (!scrollSnapshot) {
    return false;
  }
  if (userHasScrolled) {
    return false;
  }
  return (currentScrollTop || 0) <= 2;
}

export function getRetainedScrollTop(previousScrollTop, currentScrollTop) {
  if (typeof previousScrollTop !== "number") {
    return null;
  }
  if (Math.abs((currentScrollTop || 0) - previousScrollTop) <= 2) {
    return null;
  }
  return previousScrollTop;
}

export function shouldRetainScrollAfterAppend(snapshot, currentSongsLength) {
  if (!snapshot) {
    return false;
  }
  return currentSongsLength > snapshot.songsLength;
}

export function getAppendedPageScrollTop(snapshot, currentSongsLength, rowHeight) {
  if (!snapshot || currentSongsLength <= snapshot.songsLength) {
    return null;
  }
  return snapshot.songsLength * rowHeight;
}

export function getVirtualSongWindow({
  total,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan = 0,
}) {
  if (total <= 0 || rowHeight <= 0 || viewportHeight <= 0) {
    return {
      start: 0,
      end: Math.max(total, 0),
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const safeTotal = Math.max(total, 0);
  const firstVisible = Math.min(
    Math.floor(Math.max(scrollTop, 0) / rowHeight),
    safeTotal
  );
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const renderCount = visibleCount + overscan * 2;
  const start = Math.max(
    Math.min(firstVisible - overscan, safeTotal - renderCount),
    0
  );
  const end = Math.min(firstVisible + visibleCount + overscan, safeTotal);

  return {
    start,
    end,
    topSpacerHeight: start * rowHeight,
    bottomSpacerHeight: Math.max(safeTotal - end, 0) * rowHeight,
  };
}
