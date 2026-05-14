import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const popupEntry =
  process.env.POPUP_UI === "vue"
    ? path.resolve(configDir, "src/popup-vue.html")
    : path.resolve(configDir, "src/popup.html");

function loadJsAsJsx() {
  return {
    name: "load-js-as-jsx",
    enforce: "pre",
    async transform(code, id) {
      if (!id.match(/src\/.*\.js$/)) {
        return null;
      }

      return transformWithEsbuild(code, id, {
        loader: "jsx",
        jsx: "automatic",
      });
    },
  };
}

export default defineConfig({
  plugins: [
    loadJsAsJsx(),
    react({
      include: /\.(js|jsx)$/,
    }),
  ],
  resolve: {
    alias: {
      "react-dom": "@hot-loader/react-dom",
      crypto: "crypto-browserify",
      stream: "stream-browserify",
    },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: popupEntry,
        offscreen: path.resolve(configDir, "src/offscreen.html"),
        "service-worker": path.resolve(configDir, "src/service-worker.js"),
      },
      output: {
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === "service-worker") {
            return "service-worker.bundle.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
