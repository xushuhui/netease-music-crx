import {
  COMMON_PROPS,
  DOMAIN,
  logger,
  parseCookies,
  serializeCookies,
} from "./utils";

const OFFSCREEN_URL = "offscreen.html";
const OFFSCREEN_TARGET = "offscreen";
const MENU_CONTEXTS = ["action"];
const FORWARD_TOPICS = new Set([
  "sync",
  "error",
  "audioState",
  "changeSongsMap",
]);

let creatingOffscreenDocument;
let chinaIp = null;
let userId = null;
let audioPlaying = COMMON_PROPS.playing;
let volumeMute = null;

init();

function init() {
  initContextMenu();
  initMessageHandler();
  initRequestHook();
  initCommandHandler();
  loadServiceState();

  chrome.runtime.onInstalled.addListener(() => {
    initContextMenu();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.chinaIp) {
      chinaIp = changes.chinaIp.newValue || null;
    }
  });
}

async function loadServiceState() {
  const data = await chrome.storage.local.get(["chinaIp"]);
  chinaIp = data.chinaIp || null;
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

  chrome.contextMenus.onClicked.addListener((item) => {
    logger.debug(`contextMenu.${item.menuItemId}`);
    forwardAction(item.menuItemId, []);
  });
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
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({
    target: OFFSCREEN_TARGET,
    action,
    params,
  });
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

function initRequestHook() {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    function (details) {
      if (
        details?.initiator &&
        details.initiator.startsWith("chrome-extension://")
      ) {
        if (details.url.startsWith(DOMAIN)) {
          for (let i = 0; i < details.requestHeaders.length; ++i) {
            const header = details.requestHeaders[i];
            if (header.name === "Origin") {
              header.value = DOMAIN;
            } else if (header.name === "Cookie") {
              if (/\/weapi\/login/.test(details.url)) {
                const cookieObj = parseCookies(["os=pc; " + header.value]);
                header.value = serializeCookies(cookieObj);
              }
            }
          }
          if (chinaIp)
            details.requestHeaders.push({
              name: "X-Real-Ip",
              value: chinaIp,
            });
          details.requestHeaders.push({ name: "Referer", value: DOMAIN });
          logger.verbose("requestHook.163", details.requestHeaders);
        }
      }
      return { requestHeaders: details.requestHeaders };
    },
    {
      urls: [`${DOMAIN}/weapi/*`],
    },
    ["requestHeaders", "blocking", "extraHeaders"]
  );
}
