// Do this as the first thing so that any code reading it knows the right env.
process.env.NODE_ENV = "production";
process.env.ASSET_PATH = "/";

const shell = require("shelljs");
const webpack = require("webpack");
const config = require("../webpack.config");

config.mode = "production";

shell.rm("-rf", "build");

function runCompiler() {
  return new Promise((resolve, reject) => {
    const compiler = webpack(config);
    compiler.run((err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats?.hasErrors()) {
        reject(new Error(stats.toString("errors-only")));
        return;
      }
      compiler.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve();
      });
    });
  });
}

runCompiler().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
