# netease-music-crx 重构方案（2026-05-12）

## 1. 背景与目标

当前项目可以工作，但核心逻辑集中、状态与副作用耦合较重，近期在“音乐云盘滚动分页”场景已经暴露出可维护性问题。  
本方案目标是：**在不改变用户功能的前提下，降低回归风险、提升可测试性、减少后续修复成本**。

重构原则：

1. 先稳态，再演进：先消除高风险问题，再做结构优化。
2. 小步提交：每个阶段都可单独发布、可回滚。
3. 测试先行：关键行为先补测试，再改实现。

---

## 2. 现状问题（含证据）

### P0：核心模块过重，状态/副作用耦合

- `background/store.js` 同时承担：
  - 播放控制
  - 歌单加载
  - 云盘分页
  - 登录刷新
  - 持久化
  - 音频事件绑定
- 结果：单文件改动面过大，任意修改都有连锁影响，难以定位回归。

证据：`src/background/store.js`（全文件体量与职责混杂）。

### P0：异步流缺少统一并发控制

- 典型链路（切歌、换歌单、分页）存在并发重入可能，缺少 request token/版本号防抖。
- `loadAndPlaySong`、`changePlaylist`、`loadMoreSongs` 并发时序复杂，当前主要靠局部条件规避。

证据：`src/background/store.js` 中多个 async action 直接共享并修改 `store` 与缓存对象。

### P1：Popup 层业务逻辑过重，UI 与数据流强耦合

- `PlayList.js` 承担了：
  - 云盘滚动恢复策略
  - 异步分页触发
  - 持久化快照
  - 选中项自动定位
  - 调试日志
- 结果：一个交互问题会引发多处 effect 连锁。

证据：`src/popup/PlayList.js`。

### P1：可变共享状态 + 原地修改

- `songsMap` 在渲染链路中直接改值：`songsMap[id].valid = false`。
- 这种“渲染期写状态”会放大不可预测行为。

证据：`src/popup/PlayList.js` 中 `useMemo` 对 `songsMap` 的原地变更。

### P1：store 消息提示定时器逻辑存在缺陷

- `subscribeKey(store, "message", ...)` 内部 `let timer;` 每次回调都会重建，`clearTimeout` 无法真正清理上一次定时器。
- 会造成消息清理时序不稳定。

证据：`src/popup/store.js` 中 `subscribeKey` 逻辑。

### P2：全局污染与调试代码未隔离

- 多处 `globalThis.xxx = ...` 暴露运行态对象。
- `popupLog` / `console.info` 调试链路已进入主流程，缺少开关化。

证据：`src/popup/store.js`、`src/background/store.js`、`src/background/chrome.js`。

### P2：测试覆盖偏窄

- 当前测试主要集中在脚本与局部函数：
  - `scripts/cloud-pagination.test.js`
  - `scripts/playlist-scroll.test.js`
- 核心用例（播放状态机、歌单切换并发、错误回退）缺少自动化保障。

---

## 3. 目标架构（渐进式，不一次性推翻）

### 3.1 background 分层

建议拆为 4 层：

1. `domain/`：纯业务规则（播放模式、下一首选择、云盘分页状态计算）
2. `application/`：用例编排（切歌、换歌单、刷新）
3. `infrastructure/`：API、chrome storage、webRequest hook、第三方音源
4. `adapter/`：消息分发与 DTO 组装

### 3.2 popup 分层

1. `view/`：纯 UI 组件（无副作用）
2. `hooks/`：滚动、分页、恢复策略
3. `gateway/`：与 background 通信
4. `state/`：仅保存 UI 状态，不承载业务编排

### 3.3 横切能力

- 统一错误模型：`{ code, message, cause, retriable }`
- 统一日志接口：按 `debug/info/error` + feature tag
- 统一并发控制：request id / latest-wins 策略

---

## 4. 分阶段重构计划

## 阶段 A（1-2 天）：先稳住高风险点

目标：不改架构，只降低当前回归风险。

任务：

1. 修复 `popup/store.js` 中 message timer 缺陷（单例 ref timer）。
2. 对 `PlayList.js` 的滚动策略补回归测试矩阵（分页、重建、快速滑动）。
3. `popupLog` 增加环境开关（仅开发态输出）。
4. 把 `songsMap` 渲染期原地修改改为不可变更新。

验收：

- 云盘连续下滑 5 分钟无“跳回”。
- `bun test` 全绿，新增滚动测试覆盖关键路径。

## 阶段 B（2-4 天）：拆 background 的纯函数域

目标：把可测业务规则从 `store.js` 抽离。

任务：

1. 提取 `playbackDomain`：
   - `getNextSongId`
   - `shouldLoadMoreCloudSongs`
2. 提取 `cloudDomain`：
   - 分页状态计算
   - 追加 songsMap 合并策略
3. 为以上纯函数补单测，覆盖边界（空歌单、shuffle、末尾分页）。

验收：

- `background/store.js` 体积显著下降（目标 < 60% 当前行数）。
- 核心播放/分页规则有独立测试文件。

## 阶段 C（3-5 天）：整理应用编排层

目标：把 “动作 + 副作用” 改成可控 use-case。

任务：

1. 新建 `application/actions`：
   - `changePlaylistAction`
   - `playSongAction`
   - `loadMoreCloudSongsAction`
2. 为每个 action 建立输入输出契约（DTO）。
3. 为高风险 action 加并发令牌（latest request wins）。

验收：

- 同时触发切歌/换歌单时不出现旧请求覆盖新状态。
- 行为与现有功能一致（人工用例 + 自动测试通过）。

## 阶段 D（2-3 天）：收尾与文档

任务：

1. 清理 `globalThis` 暴露（仅保留必要调试入口）。
2. 补充 `README` 中开发架构图与调试开关说明。
3. 更新 `docs/test-op.md` 为“手工 + 自动”联动清单。

验收：

- 新人可按文档定位模块职责并跑通验证。
- 日志默认干净，问题定位时可一键开启 debug。

---

## 5. 风险与回滚策略

### 主要风险

1. 切分过程中功能回归（播放/收藏/登录态）。
2. 并发控制改造引入“状态不更新”假死。
3. 云盘分页策略改变导致历史问题复发。

### 应对策略

1. 每阶段单独分支、单独发布，不跨阶段混改。
2. 对播放主链路保留 golden 手工用例（见 `docs/test-op.md`）。
3. 引入 feature flag：新并发控制可灰度开关，失败可快速回退。

---

## 6. 建议优先级（执行顺序）

1. 阶段 A（立即做）
2. 阶段 B（A 稳定后）
3. 阶段 C（B 完成后）
4. 阶段 D（收尾）

---

## 7. 本文输出物

- 本文档：重构范围、问题证据、阶段计划、验收标准。
- 可直接作为后续任务拆分基线（按阶段开 issue / commit）。

