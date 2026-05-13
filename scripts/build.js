process.env.NODE_ENV = "production";
process.env.ASSET_PATH = "/";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createReadStream, createWriteStream } = require("node:fs");
const pkg = require("../package.json");
const yazl = require("yazl");
const inject = require("@rollup/plugin-inject");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

function loadJsAsJsx(transformWithEsbuild) {
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

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(from, entry.name);
      const dstPath = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, dstPath);
        return;
      }
      await fs.copyFile(srcPath, dstPath);
    })
  );
}

async function writeManifest() {
  const manifestPath = path.join(rootDir, "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const output = {
    description: pkg.description,
    version: pkg.version,
    ...manifest,
  };
  await fs.writeFile(
    path.join(buildDir, "manifest.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8"
  );
}

async function normalizeHtmlOutputs() {
  const srcDir = path.join(buildDir, "src");
  const names = ["popup.html", "offscreen.html"];
  await Promise.all(
    names.map(async (name) => {
      const from = path.join(srcDir, name);
      const to = path.join(buildDir, name);
      await fs.copyFile(from, to);
    })
  );
  await fs.rm(srcDir, { recursive: true, force: true });
}

async function zipBuild() {
  const zipPath = path.join(rootDir, `${pkg.name}-v${pkg.version}.zip`);
  const zipFile = new yazl.ZipFile();
  const output = createWriteStream(zipPath);
  const closePromise = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
  });

  async function addDir(dir, rel = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const srcPath = path.join(dir, entry.name);
        const relPath = path.join(rel, entry.name);
        if (entry.isDirectory()) {
          await addDir(srcPath, relPath);
          return;
        }
        zipFile.addReadStream(createReadStream(srcPath), relPath.replace(/\\/g, "/"));
      })
    );
  }

  await addDir(buildDir);
  zipFile.end();
  zipFile.outputStream.pipe(output);
  await closePromise;
}

async function runBuild() {
  const { build, transformWithEsbuild } = await import("vite");
  const reactModule = await import("@vitejs/plugin-react");
  const react = reactModule.default;
  const reactDomAlias = path.join(rootDir, "node_modules/@hot-loader/react-dom");
  const cryptoAlias = require.resolve("crypto-browserify");
  const streamAlias = require.resolve("stream-browserify");

  await fs.rm(buildDir, { recursive: true, force: true });

  const sharedConfig = {
    configFile: false,
    root: rootDir,
    publicDir: false,
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },
    plugins: [
      loadJsAsJsx(transformWithEsbuild),
      react({
        include: /\.(js|jsx)$/,
      }),
    ],
    resolve: {
      alias: {
        "react-dom": reactDomAlias,
        crypto: cryptoAlias,
        stream: streamAlias,
      },
    },
  };

  await build({
    ...sharedConfig,
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: {
          popup: path.join(rootDir, "src/popup.html"),
          offscreen: path.join(rootDir, "src/offscreen.html"),
        },
        output: {
          entryFileNames: "[name].bundle.js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
        plugins: [
          inject({
            Buffer: ["buffer", "Buffer"],
          }),
        ],
      },
    },
  });

  await build({
    ...sharedConfig,
    build: {
      outDir: buildDir,
      emptyOutDir: false,
      sourcemap: false,
      lib: {
        entry: path.join(rootDir, "src/service-worker.js"),
        formats: ["iife"],
        name: "NeteaseMusicCrxWorker",
        fileName: () => "service-worker.bundle.js",
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
        plugins: [
          inject({
            Buffer: ["buffer", "Buffer"],
          }),
        ],
      },
    },
  });

  await normalizeHtmlOutputs();
  await writeManifest();
  await copyDir(path.join(rootDir, "src/assets"), buildDir);
  await copyDir(path.join(rootDir, "src/rules"), path.join(buildDir, "rules"));
  await zipBuild();
}

runBuild().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
