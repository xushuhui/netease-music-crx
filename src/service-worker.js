import { COMMON_PROPS, DOMAIN, logger } from "./utils";

const OFFSCREEN_URL = "offscreen.html";
const OFFSCREEN_TARGET = "offscreen";
const MENU_CONTEXTS = ["action"];
const NETEASE_ORIGIN_RULE_ID = 10000;
const NETEASE_COOKIE_RULE_ID = 10001;
const COOKIE_REQUIRED_ACTIONS = new Set([
  "popupInit",
  "refreshStore",
  "logout",
  "refreshPlaylists",
  "login",
  "captchaSent",
  "changePlaylist",
  "playSong",
  "loadSongsMap",
  "loadMoreSongs",
  "likeSong",
  "unlikeSong",
]);
const FORWARD_TOPICS = new Set([
  "sync",
  "error",
  "audioState",
  "changeSongsMap",
]);

let creatingOffscreenDocument;
let userId = null;
let audioPlaying = COMMON_PROPS.audioPlaying;
let volumeMute = null;
let contextMenuClickBound = false;

init();

function init() {
  initContextMenu();
  initMessageHandler();
  initCommandHandler();

  chrome.runtime.onInstalled.addListener(() => {
    initContextMenu();
  });
}

function initContextMenu() {
  const contextMenus = {
    togglePlaying: () => ({
      title: audioPlaying ? "暂停" : "播放",
      contexts: MENU_CONTEXTS,
    }),
    playPrev: () => ({
      title: "上一首",
      contexts: MENU_CONTEXTS,
    }),
    playNext: () => ({
      title: "下一首",
      contexts: MENU_CONTEXTS,
    }),
    toggleMute: () => ({
      title: volumeMute ? "取消静音" : "静音",
      contexts: MENU_CONTEXTS,
    }),
    refreshStore: () => ({
      title: "每日刷新",
      contexts: MENU_CONTEXTS,
    }),
    logout: () => ({
      title: "退出登录",
      contexts: MENU_CONTEXTS,
      visible: !!userId,
    }),
  };

  chrome.contextMenus.removeAll(() => {
    Object.keys(contextMenus).forEach((id) => {
      chrome.contextMenus.create({
        id,
        ...contextMenus[id](),
      });
    });
  });

  if (!contextMenuClickBound) {
    chrome.contextMenus.onClicked.addListener((item) => {
      logger.debug(`contextMenu.${item.menuItemId}`);
      handleContextMenuAction(item.menuItemId);
    });
    contextMenuClickBound = true;
  }
}

async function handleContextMenuAction(action) {
  try {
    const response = await forwardAction(action, []);
    updateContextMenus(response);
    sendSyncToPopup(response);
  } catch (err) {
    chrome.runtime.sendMessage({
      target: "popup",
      topic: "error",
      message: err.message,
    });
  }
}

function sendSyncToPopup(change) {
  chrome.runtime
    .sendMessage({
      target: "popup",
      topic: "sync",
      change,
    })
    .catch?.(() => {});
}

function updateContextMenus(change = {}) {
  if (Object.prototype.hasOwnProperty.call(change, "audioPlaying")) {
    audioPlaying = change.audioPlaying;
    chrome.contextMenus.update("togglePlaying", {
      title: audioPlaying ? "暂停" : "播放",
    });
  }
  if (Object.prototype.hasOwnProperty.call(change, "userId")) {
    userId = change.userId;
    chrome.contextMenus.update("logout", { visible: !!userId });
  }
  if (Object.prototype.hasOwnProperty.call(change, "volumeMute")) {
    volumeMute = change.volumeMute;
    chrome.contextMenus.update("toggleMute", {
      title: volumeMute ? "取消静音" : "静音",
    });
  }
}

function initMessageHandler() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.target === "popup") {
      return false;
    }

    if (request?.target === OFFSCREEN_TARGET) {
      return false;
    }

    if (request?.target === "service-worker") {
      handleServiceWorkerMessage(request, sendResponse);
      return true;
    }

    if (FORWARD_TOPICS.has(request?.topic)) {
      if (request.topic === "sync") {
        updateContextMenus(request.change);
      }
      chrome.runtime.sendMessage({ ...request, target: "popup" });
      sendResponse?.({ isErr: false, message: "" });
      return false;
    }

    (async () => {
      try {
        const response = await forwardAction(
          request.action,
          request.params || []
        );
        updateContextMenus(response);
        sendResponse(response);
      } catch (err) {
        sendResponse({ isErr: true, message: err.message });
      }
    })();
    return true;
  });
}

function handleServiceWorkerMessage(request, sendResponse) {
  if (request.action === "storage.get") {
    chrome.storage.local.get(request.keys, sendResponse);
    return;
  }
  if (request.action === "storage.set") {
    chrome.storage.local.set(request.data, () => {
      sendResponse({ isErr: false, message: "" });
    });
    return;
  }
  sendResponse({ isErr: true, message: "未知操作" });
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });

  if (contexts.length > 0) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "播放扩展后台音乐",
    });
  }

  await creatingOffscreenDocument;
  creatingOffscreenDocument = null;
}

async function forwardAction(action, params) {
  if (COOKIE_REQUIRED_ACTIONS.has(action)) {
    try {
      await syncNeteaseCookieRule();
    } catch (err) {
      logger.error("syncNeteaseCookieRule.error", err?.message || err);
    }
  }
  await ensureOffscreenDocument();
  const forwardedAction = action === "popupInit" ? "refreshStore" : action;
  return chrome.runtime.sendMessage({
    target: OFFSCREEN_TARGET,
    action: forwardedAction,
    params,
  });
}

async function syncNeteaseCookieRule() {
  if (!chrome.cookies || !chrome.declarativeNetRequest) {
    return;
  }
  const { cookies, fromFallback } = await loadNeteaseCookies();
  const cookieHeader = [
    "os=pc",
    ...cookies.map((cookie) => `${cookie.name}=${cookie.value}`),
  ].join("; ");
  if (!cookies.some((cookie) => cookie.name === "MUSIC_U")) {
    logger.info("netease.cookie.missing", {
      names: cookies.map((cookie) => cookie.name),
    });
  }
  const condition = {
    excludedInitiatorDomains: ["music.163.com"],
    resourceTypes: ["xmlhttprequest"],
  };
  const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
  const update = {
    removeRuleIds: [NETEASE_ORIGIN_RULE_ID, NETEASE_COOKIE_RULE_ID],
    addRules: [
      {
        id: NETEASE_ORIGIN_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "Origin",
              operation: "set",
              value: DOMAIN,
            },
            {
              header: "Referer",
              operation: "set",
              value: DOMAIN,
            },
          ],
          responseHeaders: [
            {
              header: "Access-Control-Allow-Origin",
              operation: "set",
              value: extensionOrigin,
            },
            {
              header: "Access-Control-Allow-Credentials",
              operation: "set",
              value: "true",
            },
          ],
        },
        condition: {
          ...condition,
          urlFilter: "||music.163.com/",
        },
      },
    ],
  };
  if (cookieHeader) {
    update.addRules.push(
      {
        id: NETEASE_COOKIE_RULE_ID,
        priority: 2,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "cookie",
              operation: fromFallback ? "set" : "append",
              value: cookieHeader,
            },
          ],
        },
        condition: {
          ...condition,
          urlFilter: "||music.163.com/",
        },
      },
    );
  }
  await chrome.declarativeNetRequest.updateSessionRules(update);
}

async function loadNeteaseCookies() {
  const baseQueries = [
    { url: `${DOMAIN}/` },
    { domain: ".music.163.com" },
    { domain: "music.163.com" },
  ];
  const [urlCookies, ...fallbackCookieGroups] = await Promise.all(
    baseQueries.map((query) => chrome.cookies.getAll(query))
  );
  if (urlCookies.some((cookie) => cookie.name === "MUSIC_U")) {
    return { cookies: urlCookies, fromFallback: false };
  }

  let cookies = mergeCookies(urlCookies, ...fallbackCookieGroups);
  if (cookies.some((cookie) => cookie.name === "MUSIC_U")) {
    return { cookies, fromFallback: true };
  }

  if (chrome.cookies.getAllCookieStores) {
    const stores = await chrome.cookies.getAllCookieStores();
    for (const cookieStore of stores) {
      const storeCookieGroups = await Promise.all(
        baseQueries.map((query) =>
          chrome.cookies.getAll({ ...query, storeId: cookieStore.id })
        )
      );
      cookies = mergeCookies(cookies, ...storeCookieGroups);
      if (cookies.some((cookie) => cookie.name === "MUSIC_U")) {
        return { cookies, fromFallback: true };
      }
    }
  }

  return { cookies, fromFallback: true };
}

function mergeCookies(...cookieGroups) {
  const merged = [];
  const indexes = new Map();
  cookieGroups.flat().forEach((cookie) => {
    if (!indexes.has(cookie.name)) {
      indexes.set(cookie.name, merged.length);
      merged.push(cookie);
      return;
    }
    merged[indexes.get(cookie.name)] = cookie;
  });
  return merged;
}

function initCommandHandler() {
  chrome.commands.onCommand.addListener((command) => {
    logger.debug(`command.${command}`);
    switch (command) {
      case "playNext":
      case "playPrev":
      case "togglePlaying":
        forwardAction(command, []);
        break;
      default:
        break;
    }
  });
}
