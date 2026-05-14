import { logger } from "../utils";

function consumeRuntimeLastError() {
  return chrome.runtime.lastError;
}

export function popupLog(event, payload = {}) {
  chrome.runtime.sendMessage(
    {
      action: "popupLog",
      params: [event, payload],
    },
    consumeRuntimeLastError
  );
}

export function sendRuntimeAction({ action, params = [], silent = false }) {
  if (!silent) {
    logger.debug(`${action}.req`, params);
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, params }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        return reject(lastError.message || "扩展消息通道已关闭");
      }

      if (!silent && action !== "loadSongsMap") {
        logger.debug(`${action}.res`, response);
      }

      if (!response) {
        return reject("扩展后台未返回响应");
      }

      if (response.isErr) {
        return reject(response.message);
      }

      return resolve(response);
    });
  });
}
