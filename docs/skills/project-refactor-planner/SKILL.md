---
name: project-refactor-planner
description: Use when asked to read a repository, analyze architecture or code quality problems, identify technical debt, or write a refactoring plan/document for a local project
---

# Project Refactor Planner

## Overview

用于本地仓库的代码分析和重构文档产出。核心目标是先读代码、再给证据、最后写出可执行的 `docs/` 文档。

适用输出：

- 架构问题清单
- 技术债分级
- 分阶段重构计划
- 可执行验收标准
- 风险与回滚策略

## When To Use

当用户表达以下需求时使用：

- 读取项目代码并分析问题
- 写重构方案、重构计划、技术债文档
- 梳理项目架构、模块职责、维护风险
- 生成可放入 `docs/` 的文档
- 给新人或后续 agent 留可执行交接材料

不适用：

- 用户只问某个具体 bug 的修复方式
- 用户只要求解释单个函数
- 用户明确要求立刻实现代码，而不是写文档

## Inputs

- `scope`: 默认全仓；也可以是 `src/background`、`src/popup` 等子目录
- `output_doc`: 默认 `docs/refactor-plan-YYYY-MM-DD.md`
- `priority`: 默认 `P0/P1/P2`

## Workflow

### 1. Collect Context

并行读取这些材料：

- `README.md`
- `docs/`
- 入口文件，例如 `src/*`、`cmd/*`、`app/*`
- 核心业务目录
- 测试目录和测试脚本
- 构建与依赖配置，例如 `package.json`、`go.mod`、`Makefile`

优先关注：

- 体量最大、职责最多的文件
- 高变更风险模块
- 状态、并发、IO、缓存、网络请求、持久化
- 测试缺口和文档过期点

### 2. Classify Problems

按影响分级：

- `P0`: 核心链路风险、并发/状态错乱、用户可见回归
- `P1`: 模块边界不清、可维护性差、测试不足
- `P2`: 日志、文档、工程规范、可观测性缺口

每个问题必须包含：

- 现象
- 影响
- 代码证据（文件名 + 函数/模块）
- 建议处理阶段

### 3. Write Refactor Plan

默认拆成 3-4 个阶段：

- 阶段 A：稳态修复，先补测试和低风险缺陷
- 阶段 B：抽离纯业务规则和领域函数
- 阶段 C：治理应用编排、异步流程和状态边界
- 阶段 D：文档、日志、测试矩阵和收尾

每阶段必须写：

- 范围
- 任务清单
- 验收标准
- 风险与回滚

### 4. Save Document

写入 `docs/`，文件名建议：

```text
docs/refactor-plan-YYYY-MM-DD.md
docs/refactor-audit-report-YYYY-MM-DD.md
```

## Document Template

```markdown
# 项目重构方案（YYYY-MM-DD）

## 1. 背景与目标

## 2. 现状问题

### P0

### P1

### P2

## 3. 目标架构

## 4. 分阶段计划

## 5. 验收标准

## 6. 风险与回滚
```

## Quality Bar

- 不写空泛建议，必须落到文件、函数、模块边界
- 不建议一次性大重写，优先渐进式改造
- 不只列问题，必须给执行顺序
- 不省略测试、验收和回滚
- 文档应能直接拆成 issue 或任务单
