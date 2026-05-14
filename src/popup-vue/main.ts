import { subscribe } from "valtio";
import store, {
  captchaSent,
  changePlaylist,
  loadSongsMap,
  loadMoreSongs,
  login,
  playNext,
  playPrev,
  playSong,
  popupInit,
  refreshPlaylists,
  togglePlaying,
  updateAudioTime,
  updatePlayMode,
  updateVolume,
} from "../popup/store";
import { formatScondTime } from "../utils";
import "./styles.css";

type Song = {
  id: number;
  name: string;
  artists: string;
  duration: number;
  valid: boolean;
  vip?: boolean;
};

const state = {
  songsMap: {} as Record<number, Song>,
  cloudScrollTopByPlaylist: {} as Record<number, number>,
  showLogin: false,
  playlistScrollTop: 0,
  rafId: 0 as number,
  scrollFreeze: false,
  pendingRerender: false,
  scrollFreezeTimer: 0 as number,
  toggleInFlight: false,
  toggleQueued: false,
  suppressFullRerenderUntil: 0,
  songsScrollTopByPlaylist: {} as Record<number, number>,
};

function safeText(value: unknown) {
  if (value == null) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function visibleSongs() {
  const selectedPlaylist = store.selectedPlaylist;
  if (!selectedPlaylist?.normalIndexes) return [];
  return selectedPlaylist.normalIndexes
    .map((id: number) => state.songsMap[id])
    .filter((song): song is Song => !!song);
}

async function refreshSongsMap() {
  try {
    const songsMap = await loadSongsMap();
    state.songsMap = songsMap || {};
  } catch {
    state.songsMap = {};
  }
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;
  const songs = visibleSongs();
  const selectedSong = store.selectedSong;
  const currentTime = store.audioState?.currentTime || 0;
  const duration = store.audioState?.duration || 0;
  const percentPlayed = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;

  app.innerHTML = `
    <main class="layout">
      <section class="player">
        <div class="ctrl-group">
          <button class="icon-btn" id="btn-prev">◀</button>
          <button class="icon-btn" id="btn-toggle">${store.audioPlaying ? "❚❚" : "▶"}</button>
          <button class="icon-btn" id="btn-next">▶</button>
        </div>
        <div class="song-meta">
          <img class="cover" src="${safeText(selectedSong?.picUrl || "")}" alt="" />
          <div class="song-text">
            <div class="line">
              <span class="name">${safeText(selectedSong?.name || "歌名")}</span>
              <span class="artist">${safeText(selectedSong?.artists || "歌手")}</span>
            </div>
            <input id="seek" class="seek" type="range" min="0" max="100" value="${percentPlayed}" />
          </div>
          <div class="time">${formatScondTime(currentTime)} / ${formatScondTime(duration)}</div>
        </div>
        <div class="vol-group">
          <button class="icon-btn mini ghost" title="收藏">♡</button>
          <button class="icon-btn mini" id="btn-play-mode" title="播放模式">↻</button>
          <span class="vol-text" title="音量">🔊</span>
          <input id="volume" class="vol" type="range" min="0" max="100" value="${Math.round(
            store.volume * 100
          )}" />
        </div>
      </section>
      ${
        !store.userId && state.showLogin
          ? `
      <section class="login-panel">
        <input id="phone" class="login-input" placeholder="手机号" />
        <input id="captcha" class="login-input" placeholder="验证码" />
        <div class="login-actions">
          <button class="mini-btn" id="btn-captcha">发送验证码</button>
          <button class="mini-btn primary" id="btn-login">登录</button>
          <button class="mini-btn" id="btn-refresh-playlists">刷新歌单</button>
          <button class="mini-btn" id="btn-close-login">收起登录</button>
        </div>
      </section>
      `
          : ""
      }

      <section class="content">
        <aside class="left" id="playlist-list">
          ${(store.playlists || [])
            .map((playlist, index, arr) => {
              const sep = index > 0 && arr[index - 1].type !== playlist.type;
              return `
              <button class="playlist-item ${
                playlist.id === store.selectedPlaylist?.id ? "active" : ""
              } ${sep ? "sep" : ""}" data-playlist-id="${playlist.id}">
                ${
                  playlist.picUrl
                    ? `<img class="playlist-avatar" src="${safeText(playlist.picUrl)}" alt="" />`
                    : '<span class="dot">♫</span>'
                }
                <span class="text"> ${safeText(playlist.name)}</span>
              </button>
            `;
            })
            .join("")}
        </aside>
        <section class="right">
          <header class="songs-head">
            <span>歌曲</span><span>歌手</span><span class="ta-r">时长</span>
          </header>
          <div class="songs-body" id="songs-body">
            ${songs
              .map((song) => {
                const selected = song.id === store.selectedSong?.id;
                return `
                <button class="song-row ${selected ? "active" : ""} ${
                  song.valid ? "" : "invalid"
                }" data-song-id="${song.id}">
                  <span class="song-name">▶ ${safeText(song.name)}${
                  song.vip ? '<em class="vip">vip</em>' : ""
                }</span>
                  <span class="song-artist">${safeText(song.artists || "-")}</span>
                  <span class="song-time">${song.duration ? formatScondTime(song.duration / 1000) : "-"}</span>
                </button>
              `;
              })
              .join("")}
            ${
              store.selectedPlaylist?.type === 5 && store.selectedPlaylist?.hasMore
                ? `<button class="load-more" id="btn-load-more">加载更多</button>`
                : ""
            }
          </div>
        </section>
      </section>
      ${
        !store.userId && !state.showLogin
          ? '<section class="login-tip">登录后获取个性化推荐及我的歌单 <button class="mini-btn primary" id="btn-show-login">登录</button></section>'
          : ""
      }
      ${
        store.message
          ? `<p class="msg ${store.isErr ? "err" : "ok"}">${safeText(store.message)}</p>`
          : ""
      }
    </main>
  `;
}

function bindEvents() {
  const on = (id: string, handler: (e: Event) => void | Promise<void>) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", (e) => {
      void handler(e);
    });
  };

  on("btn-prev", () => {
    void playPrev().catch(() => {});
  });
  on("btn-toggle", () => {
    if (state.toggleInFlight) {
      state.toggleQueued = true;
      return;
    }
    state.toggleInFlight = true;
    void togglePlaying()
      .catch(() => {})
      .finally(() => {
        state.suppressFullRerenderUntil = Date.now() + 120;
        state.toggleInFlight = false;
        if (state.toggleQueued) {
          state.toggleQueued = false;
          const btn = document.getElementById("btn-toggle");
          btn?.click();
        }
      });
  });
  on("btn-next", () => {
    void playNext().catch(() => {});
  });
  on("btn-play-mode", () => {
    void updatePlayMode().catch(() => {});
  });
  on("btn-refresh-playlists", async () => {
    await refreshPlaylists().catch(() => {});
    await refreshSongsMap();
    rerender();
  });
  on("btn-captcha", async () => {
    const phone = (document.getElementById("phone") as HTMLInputElement | null)?.value;
    if (!phone) return;
    await captchaSent(phone).catch(() => {});
  });
  on("btn-login", async () => {
    const phone = (document.getElementById("phone") as HTMLInputElement | null)?.value;
    const code = (document.getElementById("captcha") as HTMLInputElement | null)?.value;
    if (!phone || !code) return;
    await login(phone, code).catch(() => {});
    await refreshSongsMap();
    rerender();
  });
  on("btn-load-more", async () => {
    await loadMoreSongs().catch(() => {});
    await refreshSongsMap();
    rerender();
  });
  on("btn-show-login", async () => {
    state.showLogin = true;
    rerender();
  });
  on("btn-close-login", async () => {
    state.showLogin = false;
    rerender();
  });

  const volume = document.getElementById("volume") as HTMLInputElement | null;
  if (volume) {
    volume.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value) / 100;
      void updateVolume(v).catch(() => {});
    });
  }

  const seek = document.getElementById("seek") as HTMLInputElement | null;
  if (seek) {
    seek.addEventListener("input", (e) => {
      const p = Number((e.target as HTMLInputElement).value);
      const d = store.audioState?.duration || 0;
      void updateAudioTime((p * d) / 100).catch(() => {});
    });
  }

  document.querySelectorAll("[data-playlist-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const id = Number((node as HTMLElement).dataset.playlistId);
      const current = store.selectedPlaylist;
      if (current && current.id !== id) {
        store.selectedPlaylist = { ...current, id };
        rerender();
      }
      void changePlaylist(id)
        .then(() => refreshSongsMap())
        .then(() => {
          rerender();
          const body = document.getElementById("songs-body");
          if (body) {
            const top = state.cloudScrollTopByPlaylist[id] || 0;
            body.scrollTop = top;
          }
        })
        .catch(() => {});
    });
  });

  const playlistList = document.getElementById("playlist-list");
  if (playlistList) {
    playlistList.scrollTop = state.playlistScrollTop;
    playlistList.addEventListener("scroll", () => {
      markScrolling();
      state.playlistScrollTop = playlistList.scrollTop;
    });
  }

  document.querySelectorAll("[data-song-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const id = Number((node as HTMLElement).dataset.songId);
      const song = state.songsMap[id];
      if (song) {
        store.selectedSong = song as typeof store.selectedSong;
        rerender();
      }
      void playSong(id).catch(() => {});
    });
  });

  const songsBody = document.getElementById("songs-body");
  if (songsBody && store.selectedPlaylist?.id) {
    const pid = store.selectedPlaylist.id;
    const restoreTop = state.songsScrollTopByPlaylist[pid];
    if (typeof restoreTop === "number") {
      songsBody.scrollTop = restoreTop;
    }
    songsBody.addEventListener("scroll", () => {
      markScrolling();
      const playlistId = store.selectedPlaylist?.id;
      if (!playlistId) return;
      state.cloudScrollTopByPlaylist[playlistId] = songsBody.scrollTop;
      state.songsScrollTopByPlaylist[playlistId] = songsBody.scrollTop;
    });
  }
}

function rerender() {
  render();
  bindEvents();
}

function scheduleRerender() {
  if (Date.now() < state.suppressFullRerenderUntil) {
    state.pendingRerender = true;
    return;
  }
  if (state.scrollFreeze) {
    state.pendingRerender = true;
    return;
  }
  if (state.rafId) return;
  state.rafId = requestAnimationFrame(() => {
    state.rafId = 0;
    rerender();
  });
}

function markScrolling() {
  state.scrollFreeze = true;
  if (state.scrollFreezeTimer) {
    clearTimeout(state.scrollFreezeTimer);
  }
  state.scrollFreezeTimer = window.setTimeout(() => {
    state.scrollFreeze = false;
    if (state.pendingRerender) {
      state.pendingRerender = false;
      scheduleRerender();
    }
  }, 120);
}

async function bootstrap() {
  await popupInit().catch(() => {});
  await refreshSongsMap();
  rerender();
  subscribe(store, () => {
    if (store.songsMapChanged) {
      void refreshSongsMap().then(scheduleRerender);
      return;
    }
    scheduleRerender();
  });
}

bootstrap();
