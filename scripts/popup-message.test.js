const { test, expect } = require("bun:test");

test("popup actions reject when the runtime message channel closes", async () => {
  globalThis.chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener() {},
      },
      sendMessage(_message, callback) {
        this.lastError = {
          message: "The message channel closed before a response was received.",
        };
        callback(undefined);
        this.lastError = null;
      },
    },
  };

  const { updateVolume } = await import(
    "../src/popup/store.js?message-channel-closed"
  );

  await expect(updateVolume(50)).rejects.toBe(
    "The message channel closed before a response was received."
  );
});
