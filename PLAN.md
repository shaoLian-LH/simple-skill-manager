# 支持 `--global` 与可扩展 targets 的启用体系重构

## 概要

- 把 target 从“字符串目录名”升级为“可扩展 target 规范注册表”，首批支持 `.agents`、`.trae`、`.kiro`、`.claude`、`.gemini`。
- 新增全局启用状态文件 `~/.simple-skill-manager/global-state.json`；项目内 `.skm/state.json` 继续只记录项目级启用，不混入任何全局数据。
- `skill enable` / `preset enable` 新增 `--global`；其语义是安装到用户级 target 根目录，而不是当前项目目录。
- `.agents` / `.trae` / `.kiro` / `.claude` 继续安装为原始 skill 目录；`.gemini` 按官方规范投影为 `commands/*.toml`。

## 关键改动

### 1. Target 模型

- 新增 target 注册表，字段至少包含：`name`、`projectRootDir`、`globalRootDir`、`installKind`、`localInstallBase`、`globalInstallBase`。
- `installKind` 首批定义两类：
  - `skill-dir`：把 skill 目录安装到 `<root>/skills/<skill-name>`
  - `gemini-command`：把 skill 投影为 `<root>/commands/<skill-path>.toml`
- `SUPPORTED_TARGETS` 改为从注册表导出，`Config.defaultTargets`、CLI 校验、UI `supportedTargets` 全部复用同一来源。
- 保留“target 可扩展”设计：后续新增 target 只新增注册项和投影器，不再修改启用主流程。

### 2. 作用域与状态

- 新增 `ActivationScope = 'project' | 'global'` 概念，但项目状态和全局状态物理分离。
- 新增全局状态结构，文件为 `~/.simple-skill-manager/global-state.json`，内容与项目状态平行：`version`、`targets`、`enabledSkills`、`enabledPresets`、`updatedAt`；不包含 `projectPath`。
- 现有 `.skm/state.json` 结构保持“仅项目级”语义；`projects.json` 继续只镜像项目状态，不记录全局状态。
- `doctor` / `sync` 增加全局模式：默认仍检查当前项目；传 `--global` 时检查和修复 `global-state.json` 对应的用户级安装。
- `skill disable` / `preset disable` 新增 `--global`，只操作全局状态；未带 `--global` 时只操作项目状态。

### 3. 安装与投影

- 安装路径解析从 `resolveSkillInstallPath(projectPath, target, skillName)` 改成“按 scope + target 规范”解析真实落点。
- `skill-dir` targets：
  - 项目级：`.agents/skills`、`.trae/skills`、`.kiro/skills`、`.claude/skills`
  - 全局级：`~/.agents/skills`、`~/.trae/skills`、`~/.kiro/skills`、`~/.claude/skills`
- `.gemini` target：
  - 项目级：`<project>/.gemini/commands/<skill-path>.toml`
  - 全局级：`~/.gemini/commands/<skill-path>.toml`
  - `skillName` 若为 `scope/name`，文件落点为 `commands/scope/name.toml`，对应 Gemini 命令 `/scope:name`
  - TOML 内容固定生成：
    - `description = <skill.description>`
    - `prompt = <SKILL.md 去掉 frontmatter 后的 markdown body>`
- 不尝试解析 skill 内额外语义，不生成 `GEMINI.md`，避免把“可启用技能”误做成“常驻上下文”。
- `.gemini` 安装不走 symlink/copy 二选一；统一生成为受管文件，状态中 `installMode` 新增 `generated`。
- `skill-dir` targets 保持现有 `symlink` 优先、失败回退 `copy` 的策略。

### 4. CLI / 交互 / 文档

- `skm skill enable ...` 与 `skm preset enable ...` 新增 `--global` 布尔参数；允许与重复 `--target` 组合使用。
- `collectTargets()` 的交互文案按 target 规范生成，不再写死 “Install into <target>/skills in the current project”。
- 交互确认文案区分 scope，例如“Enable skills [...] globally with targets [...]?”。
- `config.defaultTargets` 仍只存 target 名，不存 scope；它仅作用于项目级默认启用。全局启用必须显式传 `--global`。
- `README.md` 更新：
  - 新增 `--global` 示例
  - 补充 `.kiro`、`.claude`、`.gemini` 支持说明
  - 明确 `.gemini` 是 command 投影，不是原始 skill 目录
  - 新增 `global-state.json` 文件说明

## 对外接口变更

### `src/core/types.ts`

- `SUPPORTED_TARGETS` 扩展为 `['.agents', '.trae', '.kiro', '.claude', '.gemini']`
- `InstallMode` 扩展 `generated`
- 新增 `GlobalState`
- `ProjectState.targets` 与 `GlobalState.targets` 共享同一 target-state 结构

### `src/core/activation/service.ts`

- `EnableSkillsRequest` / `EnablePresetsRequest` / `DisableSkillsRequest` / `DisablePresetsRequest` 新增 `scope`
- `sync` / `doctor` 的服务入口新增 scope 参数

### `src/cli/program.ts`

- `skill enable|disable`、`preset enable|disable`、`sync`、`doctor` 新增 `--global`

### `src/ui/web/app/src/types.ts` 与相关 API

- 配置视图里的 `supportedTargets` 扩展
- 若 UI 已暴露启用/禁用动作，补充 scope 字段；若当前 UI 未暴露全局启用入口，则只先让只读数据与配置接口兼容新 targets

## 测试方案

### 项目级回归

- `.agents` / `.trae` 现有 enable/disable/idempotent 行为保持不变
- 默认 target 仍从项目已有 state 或 `config.defaultTargets` 继承

### 全局级新增

- `skill enable --global brainstorming --target .agents` 写入 `~/.simple-skill-manager/global-state.json`，并安装到 `~/.agents/skills/brainstorming`
- 同一 skill 可同时存在项目级和全局级安装，二者状态互不污染
- `skill disable --global` 只移除全局安装，不影响项目级
- `preset enable --global` / `preset disable --global` 与 skill 同步验证

### 新 targets

- `.kiro` 项目级与全局级都安装到官方 `skills` 路径
- `.claude` 项目级与全局级都安装到官方 `skills` 路径
- `.gemini` 项目级生成 `.gemini/commands/*.toml`
- `.gemini` 全局级生成 `~/.gemini/commands/*.toml`
- scoped skill `impeccable/polish` 在 `.gemini` 下生成 `commands/impeccable/polish.toml`

### 状态与修复

- `doctor --global` 能报告缺失安装、冲突占用、失效源路径
- `sync --global` 能按 `global-state.json` 修复缺失项
- `projects.json` 在全局操作后不新增/修改项目条目

### 交互与校验

- `--global` + 交互选择 targets 的确认文案正确
- `config.defaultTargets` 允许新 targets
- 不支持的 target 仍报 usage 错误

### README / Contract

- API 或配置接口返回的 `supportedTargets` 包含新增 targets
- 文档示例与实际路径保持一致

## 约束与默认假设

- `.claude` 采用官方目录名，不支持 `.claude-code` 别名。
- `.gemini` 首版只支持 `commands` 投影；不写 `GEMINI.md`。
- `.gemini` 的 command 内容直接由 skill 的 `description` 与 markdown body 生成，不额外解析 frontmatter 中的其他字段。
- 全局 state 文件初始缺失时按空状态处理；首次全局启用时自动创建。
- `config.defaultTargets` 仅影响项目级启用默认值；全局启用必须显式传 `--global`。

## 参考

- `src/core/types.ts`
- `src/core/install/targets.ts`
- `src/core/activation/service.ts`
- `src/core/state/project-state.ts`
- `src/cli/program.ts`
- `README.md`
- `https://docs.anthropic.com/en/docs/claude-code/memory`
- `https://docs.anthropic.com/en/docs/claude-code/slash-commands`
- `https://kiro.dev/docs/skills/`
- `https://kiro.dev/docs/steering/`
- `https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html`
- `https://google-gemini.github.io/gemini-cli/docs/cli/custom-commands.html`
