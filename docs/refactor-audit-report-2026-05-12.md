# 项目重构审计报告（基于 skill: project-refactor-audit）

日期：2026-05-12  
范围：`src/`、`scripts/`、`docs/`、构建配置

---

## 一、结论摘要

项目当前主要风险不在“功能缺失”，而在**状态与副作用耦合、模块职责混乱、并发流程不可控**。  
建议采用“稳态修复 -> 领域拆分 -> 编排治理 -> 收尾标准化”的四阶段方案，避免一次性大重写。

---

## 二、问题清单（按优先级）

## P0（必须先处理）

### 1) `background/store.js` 过载，单文件承担多职责

- 现象：播放控制、云盘分页、歌单加载、登录刷新、音频事件、持久化都集中在同一模块。
- 影响：回归范围大，修改任意链路都可能影响播放主路径。
- 证据：`src/background/store.js`（体量大、跨域逻辑混排）。

### 2) 异步状态写入无统一并发策略

- 现象：`changePlaylist` / `loadAndPlaySong` / `loadMoreSongs` 等动作都直接写全局状态，缺少版本控制。
- 影响：快速操作时可能出现旧请求覆盖新状态、UI 与音频状态不一致。
- 证据：`src/background/store.js` 中多个 async action 共享 `store` 和缓存对象。

### 3) 云盘滚动链路复杂，回归成本高

- 现象：滚动恢复、分页追加、快照持久化、选中定位叠加在 `PlayList.js` 内。
- 影响：一个滚动问题需要跨多个 effect 排查，修复效率低。
- 证据：`src/popup/PlayList.js`。

## P1（建议第二阶段解决）

### 4) Popup 侧副作用过多，UI 组件承担应用编排

- 现象：`PlayList` 组件同时处理数据请求、状态恢复、滚动行为、日志采集。
- 影响：组件可读性差，难写稳定测试。
- 证据：`src/popup/PlayList.js`。

### 5) 可变对象在渲染链路中被原地修改

- 现象：`useMemo` 中直接写 `songsMap[id].valid = false`。
- 影响：增加不可预期渲染，弱化状态可追踪性。
- 证据：`src/popup/PlayList.js`。

### 6) 消息自动清理 timer 设计不稳

- 现象：`subscribeKey(...message...)` 内局部 `timer` 每次重建，无法稳定取消上一次任务。
- 影响：提示消息消失时机不稳定。
- 证据：`src/popup/store.js`。

## P2（可并行治理）

### 7) 调试能力无开关分层

- 现象：`popupLog` 通过 message 管道写到 background `console.info`，与业务同路径。
- 影响：日志噪声高，线上/开发态边界不清晰。
- 证据：`src/popup/store.js`、`src/background/chrome.js`。

### 8) 全局对象暴露较多

- 现象：`globalThis.store`、`globalThis.playlistDetailStore` 等。
- 影响：调试便利，但污染运行时边界，不利于封装。
- 证据：`src/popup/store.js`、`src/background/store.js`。

### 9) 测试层次偏浅

- 现象：当前主要是脚本和局部函数测试。
- 影响：核心行为（并发切歌、状态一致性、登录态恢复）缺少回归防线。
- 证据：`scripts/cloud-pagination.test.js`、`scripts/playlist-scroll.test.js`。

---

## 三、目标重构结构

## 1) Background 分层

建议目录：

- `src/background/domain/`：纯规则函数（可单测）
- `src/background/application/`：用例编排（action/usecase）
- `src/background/infrastructure/`：API、chrome adapter、第三方音源
- `src/background/index.js`：启动与装配

## 2) Popup 分层

- `src/popup/view/`：纯 UI 组件
- `src/popup/hooks/`：滚动、分页、恢复逻辑
- `src/popup/gateway/`：与 background 通信
- `src/popup/state/`：UI 状态容器

## 3) 统一机制

- 并发策略：`latest-wins`（请求令牌）
- 错误模型：统一 `code/message/retriable`
- 日志开关：仅开发态开启详细链路日志

---

## 四、分阶段执行计划

## 阶段 A：稳态修复（1-2 天）

任务：

1. 修复 `popup/store.js` message timer。
2. 给云盘滚动/分页链路补完整回归测试用例。
3. `popupLog` 加环境开关。
4. 清理渲染路径中的可变写操作。

验收：

- 云盘连续滚动场景无跳动；
- `bun test` 全通过；
- 行为与当前功能一致。

## 阶段 B：抽离纯业务规则（2-3 天）

任务：

1. 抽离播放规则：下一首、循环/随机策略。
2. 抽离云盘分页状态计算与 songsMap 合并逻辑。
3. 为纯函数建立独立测试文件。

验收：

- `background/store.js` 明显瘦身；
- 规则函数测试覆盖核心边界。

## 阶段 C：编排层治理（3-4 天）

任务：

1. 用例化 `changePlaylist` / `playSong` / `loadMoreSongs`。
2. 引入请求令牌，避免旧请求覆盖新状态。
3. 输出 action 输入输出契约。

验收：

- 快速连续操作时状态一致；
- 关键链路具备稳定回归测试。

## 阶段 D：文档与工程收口（1-2 天）

任务：

1. 精简 `globalThis` 暴露；
2. 更新 README 的模块边界与调试说明；
3. 更新 `docs/test-op.md` 为“自动 + 手工”双清单。

验收：

- 新人可按文档快速定位模块；
- 默认日志可读，问题定位可开关。

---

## 五、风险与回滚

风险：

1. 重构中引入播放行为回归；
2. 并发策略调整导致“无响应”误判；
3. 云盘分页行为变化带来体验倒退。

回滚策略：

1. 每阶段独立提交，不跨阶段混改；
2. 每阶段保留可回滚标签；
3. 高风险改动增加 feature flag（可灰度关闭）。

---

## 六、建议下一步

按阶段 A 先做最小改造与测试补齐，再进入阶段 B。  
先稳后拆，整体风险最低。

