import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import { COMMON_PROPS, EMPTY_AUDIO_STATE, logger } from "../utils";
import { popupLog as sendPopupLog, sendRuntimeAction } from "./runtime";

const store = proxy({
  message: "",
  isErr: true,
  songsMapChanged: null,
  audioState: { ...EMPTY_AUDIO_STATE },
  ...COMMON_PROPS,
});
globalThis.store = store;

export function updateAudioTime(currentTime) {
  return doAction("updateAudioTime", [currentTime]);
}

export function togglePlaying() {
  return doAction("togglePlaying");
}

export function updateVolume(volume) {
  return doAction("updateVolume", [volume]);
}

export function playPrev() {
  return doAction("playPrev");
}

export function playNext() {
  return doAction("playNext");
}

export function playSong(songId) {
  return doAction("playSong", [songId]);
}

export function updatePlayMode() {
  return doAction("updatePlayMode");
}

export function changePlaylist(playlistId) {
  return doAction("changePlaylist", [playlistId]);
}

export function loadSongsMap() {
  store.songsMapChanged = null;
  return doAction("loadSongsMap");
}

export function loadMoreSongs() {
  return doAction("loadMoreSongs");
}

export function saveCloudScrollSnapshot(playlistId, snapshot) {
  return doAction("saveCloudScrollSnapshot", [playlistId, snapshot]);
}

export function loadCloudScrollSnapshot(playlistId) {
  return doAction("loadCloudScrollSnapshot", [playlistId]);
}

export function likeSong(playlistId) {
  return doAction("likeSong", [playlistId]);
}

export function unlikeSong() {
  return doAction("unlikeSong");
}

export function login(phone, captcha) {
  return doAction("login", [phone, captcha]);
}

export function captchaSent(phone) {
  return doAction("captchaSent", [phone]);
}

export function refreshPlaylists() {
  return doAction("refreshPlaylists");
}

export function popupInit() {
  return doAction("popupInit");
}

export function popupLog(event, payload = {}) {
  sendPopupLog(event, payload);
}

function doAction(action, params = []) {
  return sendRuntimeAction({ action, params })
    .then((response) => {
      Object.assign(store, response);
      return response;
    })
    .catch((message) => {
      Object.assign(store, { message, isErr: true });
      return Promise.reject(message);
    });
}

subscribeKey(store, "message", () => {
  let timer;
  if (store.message) {
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        Object.assign(store, { message: "", isErr: false });
      },
      store.isErr ? 5000 : 3000
    );
  }
});

chrome.runtime.onMessage.addListener((request) => {
  switch (request?.topic) {
    case "sync":
      logger.debug("sync", request.change);
      Object.assign(store, request.change);
      break;
    case "error":
      Object.assign(store, { message: request.message, isErr: true });
      break;
    case "info":
      Object.assign(store, { message: request.message, isErr: false });
      break;
    case "audioState":
      Object.assign(store, { audioState: request.audioState });
      break;
    case "changeSongsMap":
      logger.debug("sync", request);
      Object.assign(store, {
        songsMapChanged: { songId: request.songId, op: request.op },
      });
      break;
    default:
      break;
  }
});

globalThis.store = store;

export default store;
