import store, * as storeUtils from "./store";
import { subscribeKey } from "valtio/utils";
import { COMMON_PROPS, logger } from "../utils";

export function init() {
  if (chrome.contextMenus) {
    initContextMenu();
  }
  initMessageHandler();
}

export function sendToPopup(data) {
  chrome.runtime.sendMessage(data);
}

export function saveData(data) {
  return new Promise((resolve) => {
    if (chrome.storage) {
      chrome.storage.local.set(data, resolve);
      return;
    }
    chrome.runtime.sendMessage(
      { target: "service-worker", action: "storage.set", data },
      resolve
    );
  });
}

export function loadData() {
  return new Promise((resolve) => {
    if (chrome.storage) {
      chrome.storage.local.get(resolve);
      return;
    }
    chrome.runtime.sendMessage(
      { target: "service-worker", action: "storage.get" },
      resolve
    );
  });
}

function initContextMenu() {
  const contexts = [
    chrome.runtime.getManifest().manifest_version === 3
      ? "action"
      : "browser_action",
  ];

  const contextMenus = {
    togglePlaying: (playing = COMMON_PROPS.playing) => ({
      title: playing ? "暂停" : "播放",
      contexts,
    }),
    playPrev: () => ({
      title: "上一首",
      contexts,
    }),
    playNext: () => ({
      title: "下一首",
      contexts,
    }),
    toggleMute: (volumeMute) => ({
      title: volumeMute ? "取消静音" : "静音",
      contexts,
    }),
    refreshStore: () => ({
      title: "每日刷新",
      contexts,
    }),
    logout: (userId) => ({
      title: "退出登录",
      contexts,
      visible: !!userId,
    }),
  };

  chrome.contextMenus.removeAll();

  Object.keys(contextMenus).forEach((id) => {
    chrome.contextMenus.create({
      id,
      ...contextMenus[id](),
    });
  });

  chrome.contextMenus.onClicked.addListener((item) => {
    logger.debug(`contextMenu.${item.menuItemId}`);
    switch (item.menuItemId) {
      case "togglePlaying":
      case "playPrev":
      case "playNext":
      case "toggleMute":
      case "refreshStore":
      case "logout":
        storeUtils[item.menuItemId]();
        break;
      default:
    }
  });

  subscribeKey(store, "audioPlaying", (audioPlaying) => {
    const id = "togglePlaying";
    chrome.contextMenus.update(id, contextMenus[id](audioPlaying));
  });

  subscribeKey(store, "userId", (userId) => {
    const id = "logout";
    chrome.contextMenus.update(id, contextMenus[id](userId));
  });

  subscribeKey(store, "volumeMute", (volumeMute) => {
    const id = "toggleMute";
    chrome.contextMenus.update(id, contextMenus[id](volumeMute));
  });
}

function initMessageHandler() {
  chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
    if (!chrome.contextMenus && request?.target !== "offscreen") {
      return false;
    }
    if (request?.target && request.target !== "offscreen") {
      return false;
    }
    const { action, params } = request;
    if (action === "popupLog") {
      const [event, payload] = params || [];
      console.info(event, payload);
      sendResponse({ isErr: false, message: "" });
      return true;
    }
    const fn = storeUtils[action];
    if (fn) {
      (async () => {
        try {
          logger.debug(`${action}.params`, params);
          const change = (await fn.apply(storeUtils, request.params)) || {};
          if (action !== "loadSongsMap") {
            logger.debug(`${action}.result`, change);
          }
          sendResponse({ isErr: false, message: "", ...change });
        } catch (err) {
          logger.debug(`${action}.error`, err);
          sendResponse({ isErr: true, message: err.message });
        }
      })();
    } else {
      sendResponse({ isErr: true, message: "未知操作" });
    }
    return true;
  });
}
