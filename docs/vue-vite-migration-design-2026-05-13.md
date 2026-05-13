# Vue + Naive UI + Vite 迁移设计文档（2026-05-13）

## 1. 背景与目标

当前项目已经迁移到 Chrome Manifest V3，核心运行结构是：

- `src/service-worker.js`：MV3 service worker，负责菜单、命令、消息转发、DNR/cookie 同步。
- `src/offscreen.js` + `src/background/store.js`：offscreen document 中运行音频与业务状态。
- `src/popup/*.js`：React 17 + MUI popup UI。
- `webpack.config.js` + `scripts/build.js`：Webpack 产出 `build/` 扩展包。

本次迁移目标：

1. 把 popup UI 从 React/MUI 迁移到 Vue 3。
2. UI 组件库采用 `naive-ui`。
3. 构建系统从 Webpack 迁移到 Vite。
4. 保持 MV3 登录、播放、offscreen、DNR/cookie 链路稳定。
5. 迁移过程可分阶段发布、可回滚，不做一次性大重写。

不在本次迁移范围：

- 不重写 `src/background/store.js` 的播放业务。
- 不把 service worker/offscreen 改成 Vue。
- 不同时做 TypeScript 全量迁移。
- 不改变 Manifest V3 权限模型。

## 2. 技术选型结论

### 2.1 Vue 版本

选择 **Vue 3 + `<script setup>`**。

原因：

- 当前要迁移的是新 popup UI，不需要兼容 Vue 2。
- TDesign Vue Next 面向 Vue 3。
- `<script setup>` 更适合小型组件和渐进迁移。

### 2.2 UI 组件库

选择 **Naive UI**，包名为 `naive-ui`。

适用理由：

- 组件密度和视觉更适合音乐播放器 popup。
- 主题系统轻量，覆盖按钮、输入框、下拉、滑块、消息提示等必需能力。
- 与 Vue 3 组合式 API 配合顺畅，迁移组件时改造成本可控。

风险：

- 组件默认样式偏通用，需要在 popup 内补一层定制主题变量。
- 图标需单独选型（建议 `@vicons/*` 或项目内自定义图标）。

设计约束：

- popup 保持紧凑布局，不引入后台管理风格。
- 列表行高、播放器区域高度由本地样式固定，避免滚动抖动。
- 组件仅承担交互，不重写现有业务协议。

备选：

- TDesign Vue Next：文档完善，但视觉更偏管理后台。
- Element Plus：不作为优先选择。

### 2.3 构建系统

选择 **Vite**，先不选 Rspack。

原因：

- 当前目标是摆脱 Webpack/Babel/MUI/React 老链路，Vite 改造更直接。
- Vite 支持多 HTML entry，适合 `popup.html` + `offscreen.html`。
- service worker 可以通过 Rollup input 固定输出文件名。
- Rspack 更像 Webpack 替代件，能降低配置迁移成本，但不能充分简化项目。

## 3. 当前问题与迁移动机

### P0：Webpack 构建链路重且与 React 绑定

现象：

- `webpack.config.js` 同时处理 popup、offscreen、service worker、manifest 注入、静态资源复制、zip。
- Babel、React preset、MUI、Emotion、hot-loader 等依赖集中在旧 UI 栈。

影响：

- 构建配置复杂，后续 Vue 迁移若继续用 Webpack，会引入 `vue-loader` 等新复杂度。
- React/MUI 删除前难以判断哪些依赖仍有必要。

建议阶段：

- 阶段 A 先把构建切到 Vite，但保留 React/MUI，降低变量数量。

### P1：Popup UI 体量集中

现象：

- `src/popup/PlayList.js` 约 556 行，承担歌曲列表、虚拟滚动、云盘分页、滚动恢复、日志。
- `src/popup/Player.js` 约 204 行，包含播放器展示与控制。
- `src/popup/store.js` 负责 UI 状态和 runtime message 通信。

影响：

- 直接全量重写 popup 风险高。
- 必须按组件逐步迁移，并用现有脚本测试锁住通信与滚动行为。

建议阶段：

- 阶段 B 建 Vue shell 和通信 gateway。
- 阶段 C 按组件迁移，并保留旧 React popup 可回退。

### P1：MV3 边界不能被 UI 迁移破坏

现象：

- 登录态依赖 `cookies` + `declarativeNetRequestWithHostAccess`。
- service worker 负责读取 cookie 并同步 DNR session rule。
- offscreen 负责音频播放与业务 store。

影响：

- UI 迁移不得改变消息协议和 offscreen 生命周期。
- 不应重新引入 `webRequestBlocking`。

建议阶段：

- Vue popup 只调用同一套 `chrome.runtime.sendMessage({ action, params })` 协议。
- service worker/offscreen 迁移期间保持纯 JS。

## 4. 目标架构

目标结构：

```text
src/
├── background/
│   ├── api.js
│   ├── cloud.js
│   └── store.js
├── popup-vue/
│   ├── App.vue
│   ├── main.js
│   ├── components/
│   │   ├── LoginPanel.vue
│   │   ├── PlayerBar.vue
│   │   ├── PlaylistView.vue
│   │   └── PlaylistSelector.vue
│   ├── composables/
│   │   ├── usePopupStore.js
│   │   ├── useRuntimeActions.js
│   │   └── usePlaylistScroll.js
│   ├── styles/
│   │   ├── theme.css
│   │   └── popup.css
│   └── naive-ui.js
├── service-worker.js
├── offscreen.js
├── popup.html
└── offscreen.html
```

构建结构：

```text
vite.config.mjs
scripts/build.js
manifest.json
src/rules/netease-request-headers.json
src/assets/
```

保留边界：

- `service-worker.js` 继续输出为 `service-worker.bundle.js`。
- `offscreen.html` 继续加载 offscreen bundle。
- `popup.html` 最终加载 Vue popup bundle。
- `manifest.json` 的文件名和权限保持兼容。

## 5. Popup 设计

### 5.1 状态层

先不引入 Pinia。

设计：

- `usePopupStore.js` 使用 Vue `reactive` 保存 popup 状态。
- `useRuntimeActions.js` 封装 runtime message。
- 现有 action 名保持不变：
  - `popupInit`
  - `refreshPlaylists`
  - `login`
  - `captchaSent`
  - `playSong`
  - `playNext`
  - `playPrev`
  - `togglePlaying`
  - `updateVolume`
  - `changePlaylist`
  - `loadSongsMap`
  - `loadMoreSongs`

原因：

- 不改变 service worker/offscreen 协议。
- 后台测试可以继续覆盖现有行为。
- Vue UI 可以独立替换，不牵动播放业务。

后续何时加 Pinia：

- 当 popup 状态拆到 5 个以上 composable，且跨组件写入关系变复杂时再引入。

### 5.2 组件映射

React -> Vue 对应关系：

- `App.js` -> `App.vue`
- `Login.js` -> `LoginPanel.vue`
- `Player.js` -> `PlayerBar.vue`
- `PlayList.js` -> `PlaylistView.vue`
- `SelectPlaylist.js` -> `PlaylistSelector.vue`
- `playlistScroll.js` -> `usePlaylistScroll.js`

MUI -> Naive UI 对应关系：

- Button -> `n-button`
- TextField/Input -> `n-input`
- IconButton -> `n-button` + icon slot
- Slider -> `n-slider`
- Select/Menu -> `n-select` / `n-dropdown`
- Snackbar/Alert -> `n-message` 或本地轻量提示条
- List/ListItem -> 自定义列表 + Naive UI 基础组件

### 5.3 样式策略

原则：

- Naive UI 组件只用于控件，不让默认后台视觉主导页面。
- popup 宽高、列表行高、播放器区域高度由本地 CSS 固定。
- 音乐播放器视觉优先，组件库只承担交互控件。

建议尺寸：

- 根容器宽度沿用当前 popup。
- 列表行固定高度，避免虚拟滚动抖动。
- 按钮统一 `size="small"` 或自定义紧凑 class。

## 6. Vite 构建设计

### 6.1 构建入口

Vite 输入需要覆盖：

- `src/popup.html`
- `src/offscreen.html`
- `src/service-worker.js`

设计重点：

- popup/offscreen 走 HTML entry。
- service worker 走 JS entry，并固定文件名为 `service-worker.bundle.js`。
- offscreen 输出文件名保持可被 `offscreen.html` 引用。
- 构建目标设置为 Chrome MV3 可用范围，最低不低于 `manifest.json` 的 Chrome 109。

### 6.2 manifest 与静态资源

Webpack 当前做了：

- 注入 `package.json` 的 `description` 和 `version` 到 `manifest.json`。
- 复制 `src/assets` 到 `build/`。
- 复制 `src/rules` 到 `build/rules`。
- 生产环境生成 zip。

Vite 迁移后保留同等能力：

1. `scripts/build.js` 继续作为唯一 build 入口。
2. build script 负责清理 `build/`。
3. Vite 负责 bundle。
4. build script 或 Vite plugin 负责：
   - 生成 `build/manifest.json`
   - 复制 assets/rules
   - 生产 zip

### 6.3 CSP 与动态 import

Manifest V3 `extension_pages` CSP 只允许 `script-src 'self'`。

约束：

- 不引入远程 CDN。
- 不使用运行时 eval。
- 不使用需要内联脚本的构建产物。
- Vite 产物要检查是否有不符合 MV3 CSP 的动态代码。

## 7. 分阶段迁移计划

### 阶段 A：Webpack -> Vite，保留 React/MUI

状态（2026-05-13）：

- 已完成代码层迁移：`scripts/build.js` 已调用 Vite，React/MUI popup 暂时保留。
- 当前采用双阶段构建：页面入口与 service worker 分开打包。
- `manifest.json` 仍使用 `background.service_worker`（未启用 `background.type = "module"`）。
- 生产 zip 产物继续由 `scripts/build.js` 生成。

目标：

- 只替换构建系统，不改变 UI 框架和行为。

任务：

1. 新增 Vite 配置。
2. 改造 `scripts/build.js` 调用 Vite。
3. 保留当前 `src/popup.js` React entry。
4. 保留当前 `src/offscreen.js` 和 `src/service-worker.js`。
5. 保留 manifest 注入、assets/rules 复制、zip 产物。
6. 更新 `scripts/build.test.js` 适配 Vite 产物。

验收：

- `bun test scripts/*.test.js` 通过。
- `bun run build` 通过。
- `build/manifest.json` 仍是 MV3。
- Chrome 重新加载 `build/` 后：
  - popup 可打开；
  - 每日刷新可用；
  - 登录态可读；
  - 播放/下一首可用；
  - service worker 控制台无 `webRequestBlocking` 错误。

回滚：

- 保留 `webpack.config.js` 与旧 build script 至阶段 A 验证完成。
- 如 Vite 产物在 Chrome 加载失败，恢复 `scripts/build.js` 到 Webpack。

### 阶段 B：建立 Vue + Naive UI popup shell

目标：

- 新建 Vue popup，但不一次性迁移全部功能。

任务：

1. 安装：
   - `vue`
   - `naive-ui`
   - `@vitejs/plugin-vue`
2. 新建 `src/popup-vue/main.js` 和 `App.vue`。
3. 建立 `useRuntimeActions.js`，复刻当前 `src/popup/store.js` 的消息兜底：
   - 处理 `chrome.runtime.lastError`
   - 处理空 response
   - 处理 `isErr`
4. 建立 `usePopupStore.js`，保存 `COMMON_PROPS` 对齐状态。
5. 建一个只显示登录态、播放状态、错误消息的最小 shell。
6. 通过构建开关选择 React popup 或 Vue popup。

验收：

- Vue popup 能调用 `popupInit`。
- popup 打开/关闭不出现 message channel 未处理错误。
- 不影响 offscreen 播放链路。

回滚：

- 构建开关切回 React popup。

### 阶段 C：逐组件迁移 popup

目标：

- 达到 React popup 功能 parity。

建议顺序：

1. `LoginPanel.vue`
   - 手机号输入
   - 验证码发送
   - 登录提交
   - 错误提示
2. `PlayerBar.vue`
   - 播放/暂停
   - 上一首/下一首
   - 音量
   - 进度
   - 当前歌曲信息
3. `PlaylistSelector.vue`
   - 歌单切换
   - 每日推荐/新歌/云盘/私人歌单
4. `PlaylistView.vue`
   - 歌曲列表
   - 不可播标记
   - 云盘分页
   - 滚动恢复
   - 虚拟窗口

验收：

- `docs/test-op.md` 手工清单关键项通过。
- 滚动相关脚本测试仍通过。
- 播放 URL 降级和不可播跳过测试仍通过。

回滚：

- 迁移期间保留 React popup 文件。
- 每个组件独立提交，失败只回滚对应组件。

### 阶段 D：删除 React/MUI/Webpack 旧链路

目标：

- Vue popup 成为唯一 popup。
- 依赖和构建配置收口。

任务：

1. 删除 React popup 文件或移动到归档分支。
2. 删除依赖：
   - `react`
   - `react-dom`
   - `react-router-dom`
   - `@mui/*`
   - `@emotion/*`
   - `@hot-loader/react-dom`
3. 删除 Webpack/Babel 相关依赖：
   - `webpack`
   - `webpack-cli`
   - `webpack-dev-server`
   - `babel-loader`
   - `@babel/preset-react`
   - `source-map-loader`
   - `style-loader`
   - `css-loader`（若 Vite 不再需要）
   - `html-webpack-plugin`
   - `copy-webpack-plugin`
   - `terser-webpack-plugin`
   - `zip-webpack-plugin`（若改为 build script zip）
4. 更新 README 的开发命令和架构说明。
5. 更新 `docs/test-op.md` 的 Vue popup 检查项。

保留依赖：

- `big-integer`
- `buffer`
- `crypto-browserify`
- `stream-browserify`
- `@tinyhttp/cookie`

是否保留需在阶段 A 验证：

- Vite 对 Node polyfill 的处理方式可能需要替代插件或代码调整。

验收：

- `bun install` 后无 React/MUI/Webpack 旧依赖。
- `bun test scripts/*.test.js` 通过。
- `bun run lint` 通过。
- `bun run build` 通过。
- Chrome 加载 `build/` 后功能 parity。

回滚：

- 阶段 D 之前保留一个可工作的 React + Vite 提交点。
- 删除依赖应单独提交，便于回滚。

## 8. 测试策略

自动测试：

- 保留并扩展 `scripts/*.test.js`。
- 阶段 A 重点验证 build 产物。
- 阶段 B 重点验证 runtime message gateway。
- 阶段 C 重点验证滚动、播放、不可播跳过、登录态刷新。

建议新增测试：

- `scripts/vite-build.test.js`
  - manifest 注入版本；
  - service worker 文件名；
  - rules/assets 复制；
  - HTML 引用本地资源。
- `scripts/popup-vue-message.test.js`
  - runtime lastError；
  - 空 response；
  - isErr response；
  - sync topic 更新。
- `scripts/popup-vue-scroll.test.js`
  - 复用现有 `playlistScroll.js` 行为。

手工测试：

- 继续使用 `docs/test-op.md`。
- 每阶段至少验证：
  - 重载扩展；
  - 每日刷新；
  - 登录态；
  - 播放；
  - 下一首/上一首；
  - 不可播歌曲自动跳过；
  - 云盘列表滚动。

## 9. 风险与应对

### 风险 1：Vite 产物不符合 MV3 CSP

应对：

- 阶段 A 单独做，先不迁 UI。
- 检查 build 产物是否包含 eval、远程资源、内联脚本。
- 失败时回滚到 Webpack。

### 风险 2：Node polyfill 行为变化

背景：

- 当前 API 加密使用 `crypto`、`buffer`、`stream-browserify` 等兼容层。

应对：

- 阶段 A 优先验证 `api-credentials` 和登录刷新。
- 必要时引入 Vite Node polyfill 或把加密模块改为浏览器原生实现。

### 风险 3：Naive UI 与现有样式混用冲突

应对：

- 先迁最小 shell，观察 popup 密度与字体表现。
- 用本地 CSS 限制尺寸、间距、列表行高。
- 先约束组件使用范围，避免全局样式扩散。

### 风险 4：Vue popup 与 offscreen 状态不一致

应对：

- 不改消息协议。
- `useRuntimeActions.js` 先复刻当前 popup store 行为。
- 每个 action 都保留 `isErr/message` 处理。

### 风险 5：一次性迁移过大

应对：

- 阶段 A、B、C、D 分开提交。
- 阶段 C 按组件拆分提交。
- React popup 保留到 Vue parity 完成后再删除。

## 10. 执行顺序建议

推荐顺序：

1. 阶段 A：Vite 构建替换，React/MUI 不动。
2. 阶段 B：Vue + Naive UI shell，与 React popup 并存。
3. 阶段 C：逐组件迁移，完成功能 parity。
4. 阶段 D：删除旧依赖和旧入口，更新文档。

不要这样做：

- 不要第一步就删除 React/MUI。
- 不要同时改 service worker/offscreen。
- 不要在 UI 迁移中顺手重构 `background/store.js`。
- 不要重新引入 `webRequestBlocking`。

## 11. 完成定义

迁移完成必须同时满足：

1. popup 完全使用 Vue 3 + Naive UI。
2. Webpack/Babel/React/MUI 旧链路已删除。
3. `bun test scripts/*.test.js` 通过。
4. `bun run lint` 通过。
5. `bun run build` 通过。
6. Chrome 加载 `build/` 后核心手工链路通过。
7. README 和 `docs/test-op.md` 已同步。
