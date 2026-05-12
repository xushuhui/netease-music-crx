const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const buildManifestPath = path.join(repoRoot, "build", "manifest.json");
const packageJson = require(path.join(repoRoot, "package.json"));

test("bun build injects valid manifest metadata", () => {
  execFileSync("bun", ["run", "build"], {
    cwd: repoRoot,
    stdio: "pipe",
  });

  const manifest = JSON.parse(fs.readFileSync(buildManifestPath, "utf8"));

  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.description, packageJson.description);
});

test("bun build emits a Manifest V3 extension bundle", () => {
  execFileSync("bun", ["run", "build"], {
    cwd: repoRoot,
    stdio: "pipe",
  });

  const manifest = JSON.parse(fs.readFileSync(buildManifestPath, "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background, {
    service_worker: "service-worker.bundle.js",
  });
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.action.default_icon, "icon-34.png");
  assert.ok(manifest.permissions.includes("offscreen"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(
    !manifest.permissions.some((permission) => permission.includes("://"))
  );
  assert.deepEqual(manifest.host_permissions, ["https://music.163.com/"]);
  assert.equal(
    fs.existsSync(path.join(repoRoot, "build", "background.html")),
    false
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, "build", "offscreen.html")),
    true
  );
});
