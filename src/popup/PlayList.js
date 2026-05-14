import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSnapshot } from "valtio";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import IconButton from "@mui/material/IconButton";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import { formatScondTime, PLAYLIST_TYPE } from "../utils";
import {
  getCloudScrollRestoreTop,
  getAppendedPageScrollTop,
  getElementScrollTop,
  getPlaylistScrollTarget,
  getVirtualSongWindow,
  isElementInScrollContainerViewport,
  shouldRetainScrollAfterAppend,
  shouldRestorePersistedCloudScroll,
  syncRefsById,
  shouldScrollSelectedSong,
} from "./playlistScroll";
import store, * as storeUtils from "./store";

const SONG_ROW_HEIGHT = 48;
const SONG_ROW_OVERSCAN = 8;

export default function PlayList({ maxHeight }) {
  const snap = useSnapshot(store);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [songListScrollTop, setSongListScrollTop] = useState(0);
  const [songsMap, setSongsMap] = useState({});
  const songListRef = useRef(null);
  const debugInstanceIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const prevSongListNodeRef = useRef(null);
  const playlistRefsRef = useRef({});
  const songRefsRef = useRef({});
  const cloudScrollPersistTimerRef = useRef(null);
  const restoredPersistedCloudScrollRef = useRef(false);
  const cloudUserScrolledRef = useRef(false);
  const pendingLoadMoreScrollTopRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const { selectedSong, selectedPlaylist, playlists, songsMapChanged } = snap;
  const currentPlaylistId = selectedPlaylist?.id;
  playlistRefsRef.current = syncRefsById(
    playlistRefsRef.current,
    playlists,
    React.createRef
  );
  const playlistRefs = playlistRefsRef.current;
  const [scrollTarget, setScrollTarget] = useState({
    playlistId: null,
    songId: null,
  });
  useEffect(() => {
    storeUtils
      .loadSongsMap()
      .then((songsMap) => setSongsMap(songsMap))
      .finally(() => {
        setLoading(false);
      });
  }, [currentPlaylistId]);
  const [songs, songRefs] = useMemo(() => {
    const songs =
      selectedPlaylist?.normalIndexes
        .map((id) => {
          if (!songsMap[id]) return null;
          if (id === songsMapChanged?.songId) {
            if (songsMapChanged?.op === "invalid") {
              songsMap[id].valid = false;
            } else if (songsMapChanged?.op === "remove") {
              return null;
            }
          }
          return songsMap[id];
        })
        .filter((v) => !!v) || [];
    songRefsRef.current = syncRefsById(
      songRefsRef.current,
      songs,
      React.createRef
    );
    const songRefs = songRefsRef.current;
    return [songs, songRefs];
  }, [selectedPlaylist, songsMap, songsMapChanged]);
  const isCloudPlaylist = selectedPlaylist?.type === PLAYLIST_TYPE.CLOUD;
  const songListHeight = maxHeight - 48;
  const virtualSongWindow = useMemo(
    () =>
      isCloudPlaylist
        ? getVirtualSongWindow({
            total: songs.length,
            scrollTop: songListScrollTop,
            viewportHeight: songListHeight,
            rowHeight: SONG_ROW_HEIGHT,
            overscan: SONG_ROW_OVERSCAN,
          })
        : {
            start: 0,
            end: songs.length,
            topSpacerHeight: 0,
            bottomSpacerHeight: 0,
          },
    [isCloudPlaylist, songs.length, songListHeight, songListScrollTop]
  );
  const renderedSongs = isCloudPlaylist
    ? songs.slice(virtualSongWindow.start, virtualSongWindow.end)
    : songs;
  const changePlaylist = (id) => {
    setLoading(true);
    const playlist = playlists.find((item) => item.id === id);
    setScrollTarget(getPlaylistScrollTarget(playlist));
    storeUtils.changePlaylist(id).catch((_) => setLoading(false));
  };
  useEffect(() => {
    scrollListItemToView(playlistRefs, selectedPlaylist?.id);
  }, [selectedPlaylist?.id, playlistRefs]);
  useEffect(() => {
    if (loading) return;
    const shouldScrollSong = shouldScrollSelectedSong(
      selectedSong?.id,
      selectedPlaylist?.id,
      scrollTarget
    );
    if (!shouldScrollSong) return;
    scrollListItemToView(
      songRefs,
      selectedSong?.id,
      {
        behavior: "smooth",
        block: "center",
      },
      songListRef.current,
      {
        instanceId: debugInstanceIdRef.current,
        playlistId: selectedPlaylist?.id,
        selectedSongId: selectedSong?.id,
        scrollTarget,
      }
    );
    setScrollTarget({ playlistId: null, songId: null });
  }, [selectedSong?.id, selectedPlaylist?.id, loading, scrollTarget, songRefs]);
  useEffect(() => {
    const node = songListRef.current;
    if (!node || selectedPlaylist?.type !== PLAYLIST_TYPE.CLOUD) {
      return;
    }
    if (prevSongListNodeRef.current !== node) {
      storeUtils.popupLog("cloud.popup.songListNode", {
        instanceId: debugInstanceIdRef.current,
        playlistId: selectedPlaylist?.id,
        replaced: !!prevSongListNodeRef.current,
        scrollTop: node.scrollTop,
      });
      prevSongListNodeRef.current = node;
    }
  }, [selectedPlaylist?.id, selectedPlaylist?.type, songs.length, loadingMore]);
  useEffect(() => {
    restoredPersistedCloudScrollRef.current = false;
    cloudUserScrolledRef.current = false;
  }, [selectedPlaylist?.id]);
  useEffect(() => {
    if (
      selectedPlaylist?.type !== PLAYLIST_TYPE.CLOUD ||
      loading ||
      songs.length === 0 ||
      !songListRef.current ||
      restoredPersistedCloudScrollRef.current
    ) {
      return;
    }
    let canceled = false;
    storeUtils
      .loadCloudScrollSnapshot(selectedPlaylist.id)
      .then(({ cloudScrollSnapshot }) => {
        if (canceled) {
          return;
        }
        const container = songListRef.current;
        if (!container) {
          return;
        }
        const shouldRestore = shouldRestorePersistedCloudScroll(
          cloudScrollSnapshot,
          container.scrollTop,
          cloudUserScrolledRef.current
        );
        if (!shouldRestore) {
          storeUtils.popupLog("cloud.popup.skipPersistedRestore", {
            instanceId: debugInstanceIdRef.current,
            playlistId: selectedPlaylist?.id,
            currentScrollTop: container.scrollTop,
            userHasScrolled: cloudUserScrolledRef.current,
          });
          restoredPersistedCloudScrollRef.current = true;
          return;
        }
        const restoreTop = getCloudScrollRestoreTop(cloudScrollSnapshot, {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
        });
        if (restoreTop !== null) {
          storeUtils.popupLog("cloud.popup.restorePersistedCloudScrollTop", {
            instanceId: debugInstanceIdRef.current,
            playlistId: selectedPlaylist?.id,
            restoreTop,
            currentScrollTop: container.scrollTop,
          });
          container.scrollTop = restoreTop;
        }
        restoredPersistedCloudScrollRef.current = true;
      })
      .catch(() => {
        restoredPersistedCloudScrollRef.current = true;
      });
    return () => {
      canceled = true;
    };
  }, [selectedPlaylist?.id, selectedPlaylist?.type, songs.length, loading]);
  const loadMoreSongs = async () => {
    if (
      loading ||
      loadingMoreRef.current ||
      selectedPlaylist?.type !== PLAYLIST_TYPE.CLOUD ||
      !selectedPlaylist?.hasMore
    ) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      pendingLoadMoreScrollTopRef.current = {
        scrollTop: songListRef.current?.scrollTop ?? null,
        songsLength: songs.length,
      };
      await storeUtils.loadMoreSongs();
      const nextSongsMap = await storeUtils.loadSongsMap();
      setSongsMap(nextSongsMap);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };
  const handleSongListScroll = (event) => {
    const container = event.currentTarget;
    const { scrollTop, clientHeight, scrollHeight } = container;
    setSongListScrollTop(scrollTop);
    if (selectedPlaylist?.type === PLAYLIST_TYPE.CLOUD && scrollTop > 2) {
      cloudUserScrolledRef.current = true;
    }
    persistCloudScrollSnapshot({
      playlistId: selectedPlaylist?.id,
      scrollTop,
      scrollHeight,
      clientHeight,
    });
  };
  useLayoutEffect(() => {
    if (
      selectedPlaylist?.type !== PLAYLIST_TYPE.CLOUD ||
      !shouldRetainScrollAfterAppend(
        pendingLoadMoreScrollTopRef.current,
        songs.length
      )
    ) {
      return;
    }
    const container = songListRef.current;
    if (!container) {
      return;
    }
    const targetTop = getAppendedPageScrollTop(
      pendingLoadMoreScrollTopRef.current,
      songs.length,
      SONG_ROW_HEIGHT
    );
    pendingLoadMoreScrollTopRef.current = null;
    if (targetTop === null) {
      return;
    }
    container.scrollTop = targetTop;
    setSongListScrollTop(targetTop);
    storeUtils.popupLog("cloud.popup.scrollToAppendedPage", {
      instanceId: debugInstanceIdRef.current,
      playlistId: selectedPlaylist?.id,
      targetTop,
      currentScrollTop: container.scrollTop,
    });
  }, [songs.length, loadingMore, selectedPlaylist?.id, selectedPlaylist?.type]);

  useEffect(() => {
    if (selectedPlaylist?.type !== PLAYLIST_TYPE.CLOUD) {
      return;
    }
    const container = songListRef.current;
    const scrollTop = getElementScrollTop(container);
    if (scrollTop === null) return;
    storeUtils.popupLog("cloud.popup.songsRendered", {
      instanceId: debugInstanceIdRef.current,
      playlistId: selectedPlaylist?.id,
      songsLength: songs.length,
      scrollTop,
      loadingMore,
    });
  }, [selectedPlaylist?.id, selectedPlaylist?.type, songs.length, loadingMore]);

  function persistCloudScrollSnapshot(snapshot) {
    if (
      selectedPlaylist?.type !== PLAYLIST_TYPE.CLOUD ||
      !snapshot?.playlistId
    ) {
      return;
    }
    clearTimeout(cloudScrollPersistTimerRef.current);
    cloudScrollPersistTimerRef.current = setTimeout(() => {
      storeUtils.saveCloudScrollSnapshot(snapshot.playlistId, snapshot);
    }, 80);
  }

  return (
    <Grid container>
      <Grid item xs={4} sx={{ background: "#f3f0f0" }}>
        <List sx={{ maxHeight, overflowY: "auto", py: 0 }}>
          {playlists.map((playlist, index) => {
            const isNewCat =
              playlists[index - 1] &&
              playlists[index - 1].type !== playlist.type;
            const renderAvatar = () => {
              if (playlist.picUrl) {
                return (
                  <Avatar
                    src={playlist.picUrl}
                    sx={{ width: 24, height: 24 }}
                  />
                );
              } else {
                return (
                  <Avatar
                    sx={{
                      width: 24,
                      height: 24,
                      color: "white",
                      background: "#ff8058",
                    }}
                  >
                    <QueueMusicIcon sx={{ fontSize: "15px" }} />
                  </Avatar>
                );
              }
            };
            return (
              <ListItemButton
                key={playlist.id}
                sx={isNewCat ? { borderTop: "1px solid #e0e0e0" } : {}}
                selected={playlist.id === currentPlaylistId}
                ref={playlistRefs[playlist.id]}
                onClick={(_) => changePlaylist(playlist.id)}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  {renderAvatar()}
                </ListItemIcon>
                <ListItemText
                  primary={playlist.name}
                  sx={{
                    ".MuiTypography-root": {
                      maxWidth: 180,
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                    },
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Grid>
      <Grid item xs={8}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr) 64px",
            alignItems: "center",
            height: 48,
            px: 2,
            borderBottom: "1px solid #e0e0e0",
            fontWeight: 600,
            background: "white",
          }}
        >
          <Box>歌曲</Box>
          <Box>歌手</Box>
          <Box sx={{ textAlign: "right" }}>时长</Box>
        </Box>
        <Box
          ref={songListRef}
          sx={{
            maxHeight: songListHeight,
            overflowY: "auto",
            overflowAnchor: "none",
            position: "relative",
          }}
          onScroll={handleSongListScroll}
        >
          {loading && (
            <Box
              sx={{
                display: "flex",
                minHeight: maxHeight - 48,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <CircularProgress />
            </Box>
          )}
          {!loading && virtualSongWindow.topSpacerHeight > 0 && (
            <Box sx={{ height: virtualSongWindow.topSpacerHeight }} />
          )}
          {!loading &&
            renderedSongs.map((song) => (
              <Box
                key={song.id}
                ref={songRefs[song.id]}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr) 64px",
                  alignItems: "center",
                  height: SONG_ROW_HEIGHT,
                  px: 2,
                  borderBottom: "1px solid #eaeaea",
                  background:
                    song.id === snap.selectedSong?.id
                      ? "#f7e8e6"
                      : "transparent",
                  ...(song.valid ? {} : { filter: "opacity(0.5)" }),
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    minWidth: 0,
                    ...(song.st < 0 ? { filter: "opacity(0.5)" } : {}),
                  }}
                >
                  <IconButton
                    disabled={!song.valid}
                    onClick={() => {
                      storeUtils.playSong(song.id);
                    }}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                  <Box
                    sx={{
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                    }}
                  >
                    {song.name}
                  </Box>
                  {song.vip && (
                    <Chip
                      sx={{ height: "20px", ml: "4px" }}
                      label="vip"
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
                <Box
                  sx={{
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                  }}
                >
                  {song.artists}
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  {song.duration ? formatScondTime(song.duration / 1000) : "-"}
                </Box>
              </Box>
            ))}
          {!loading && virtualSongWindow.bottomSpacerHeight > 0 && (
            <Box sx={{ height: virtualSongWindow.bottomSpacerHeight }} />
          )}
          {!loading && isCloudPlaylist && selectedPlaylist?.hasMore && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
              <Button
                size="small"
                variant="outlined"
                disabled={loadingMore}
                onClick={loadMoreSongs}
              >
                {loadingMore ? "加载中..." : "加载更多"}
              </Button>
            </Box>
          )}
          {loadingMore && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                py: 1,
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: "none",
                background:
                  "linear-gradient(to top, rgba(255,255,255,0.96), rgba(255,255,255,0))",
              }}
            >
              <CircularProgress size={20} />
            </Box>
          )}
        </Box>
      </Grid>
    </Grid>
  );
}

function scrollListItemToView(refs, id, opts, container, debugMeta) {
  if (id && refs[id]) {
    const el = refs[id].current;
    if (!isElementInScrollContainerViewport(el, container)) {
      storeUtils.popupLog("cloud.popup.scrollIntoView", {
        ...debugMeta,
        scrollTop: container?.scrollTop ?? null,
      });
      el.scrollIntoView(opts);
    }
  }
}
