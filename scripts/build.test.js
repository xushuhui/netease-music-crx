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
