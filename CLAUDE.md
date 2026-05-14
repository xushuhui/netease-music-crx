# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install                        # install deps
bun run build                      # production build → build/
bun run build:vue                  # build with POPUP_UI=vue (Vue popup variant)
bun run lint                       # eslint
bun test scripts/*.test.js         # run all unit tests
bun test scripts/cloud-pagination.test.js   # run single test file
bun scripts/webserver.js           # dev webserver (hot-reload popup UI)
```

Build output lands in `build/`. Load that directory in `chrome://extensions` (Developer mode → Load unpacked).

## Architecture

**Three independent JS contexts, message-passing between them:**

```
service-worker.js  ←→  popup.js (or popup-vue.html)
                   ←→  offscreen.js
```

### Service Worker (`src/service-worker.js`)
MV3 background entry. Owns context menus, command shortcuts, `declarativeNetRequest` header rules, and message routing. Forwards `sync / error / audioState / changeSongsMap` topics to popup. Delegates all business logic to the offscreen document via `postMessage`.

### Offscreen document (`src/offscreen.html` + `src/offscreen.js`)
Runs in `AUDIO_PLAYBACK` offscreen context. Owns the `<Audio>` element (not available in service workers). Receives commands (`setSrc`, `play`, `pause`, `setVolume`, `setCurrentTime`) from the service worker; emits events back (`play`, `pause`, `ended`, `timeupdate`, `progress`, `canplay`, `error`).

`src/background/store.js` — the real store — runs *inside* the offscreen document (not the SW). It holds all playback state via a Valtio `proxy`, calls `api.js` / `kuwo.js` / `migu.js`, and sends `sendToPopup(...)` for UI sync.

### Popup (`src/popup.js` → `src/popup/`)
React 17 + MUI + Valtio snapshot. Entry: `src/popup.js`. Store: `src/popup/store.js` (thin proxy that relays actions to offscreen via `chrome.runtime.sendMessage`). Components: `Player.js`, `PlayList.js`, `Login.js`, `Home.js`.

**In-progress Vue variant** (`src/popup-vue.html` → `src/popup-vue/main.ts`): vanilla-DOM renderer (no component framework) that reuses the same `src/popup/store.js`. Built with `bun run build:vue`. Not yet production-ready.

### `src/background/` modules (run inside offscreen)
| File | Role |
|---|---|
| `api.js` | NeteaseCloud API. All requests use weapi encryption (AES-128-CBC + RSA). Reads cookies from `chrome.cookies`. Falls back to `code301` hook on session expiry. |
| `kuwo.js` / `migu.js` | Fallback song URL sources for VIP / geo-locked tracks. |
| `cloud.js` | Paginated cloud-disk loader (`loadCloudSongsPage`, `loadAllCloudSongs`). Handles rate-limit retries. |
| `chrome.js` | `sendToPopup`, `saveData`/`loadData` (chrome.storage bridge), context menu setup. |
| `store.js` | Valtio store. All exported functions are popup-callable actions. Cloud disk loads first page eagerly; subsequent pages auto-fetch when playback reaches the last loaded track. |

## Key Behaviours

**Oversea detection** — on bootstrap, if >25% of 飙升榜 tracks have `st === -100` (geo-locked), a random China IP is set in `X-Real-IP` headers and URL rewrites apply (`m\d+.music.126.net` → `m\d+c.music.126.net`).

**Cloud lazy pagination** — `PlaylistDetail` carries `hasMore` / `nextOffset`. `shouldLoadMoreCloudSongs()` triggers `loadMoreSongs()` when sequential playback reaches the last loaded track. Cloud scrolls to the appended position after load.

**Daily auto-refresh** — `checkDailyRefresh()` in `popupInit`: if stored `lastRefreshDate !== today` and audio is not playing, fires `refreshStore()` silently.

**Song URL fallback** — `loadAndPlaySong` tries NeteaseCloud URL first; if `song.st < 0` or VIP-locked without subscription, falls back to KuWo then MiGu.

## MV3 Constraints

- `webRequestBlocking` unavailable — header injection is static via `declarativeNetRequest` rules in `src/rules/`.
- Audio API unavailable in service workers — always goes through offscreen document.
- After any permission change, remove and re-add the extension in `chrome://extensions`.
