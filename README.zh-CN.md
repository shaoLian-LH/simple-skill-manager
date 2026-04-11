# simple-skill-manager

[English](./README.md) | [简体中文](./README.zh-CN.md)

`simple-skill-manager`（`skm`）是一个 Node.js CLI，用来管理本地技能，并把选中的技能链接到项目级或全局目标目录，例如 `.agents`、`.trae`、`.kiro`、`.claude` 和 `.gemini`。

它不会执行技能。它负责管理技能的可见性、启用状态，以及目标目录中的安装结果。

## 功能特性

- 管理全局 `skillsDir`，自动发现本地技能
- 在项目作用域或全局作用域启用、禁用技能
- 用预设批量组织技能
- 支持多目标安装，优先符号链接，失败时回退为复制
- 通过 `sync` 校准漂移，通过 `doctor` 诊断问题
- 自动生成 `.gemini` 命令投影文件
- 通过 `skm ui` 启动本地 Web UI

## 环境要求

- Node.js 20+
- pnpm 10+

## 安装

### 本地开发

```bash
pnpm install
pnpm run build
node dist/skm.js --help
```

打包后的 CLI 通过 `package.json#bin` 暴露为 `skm`。

前端页面开发请使用 `pnpm run dev:web`。如果要通过 CLI 集成的 `skm ui` 提供页面，请先执行 `pnpm run build:web` 或 `pnpm run build`，把 Web UI 产物生成到 `dist/ui/web`。

### 开发期间链接为全局 CLI

```bash
pnpm run link:global
skm --help
pnpm run unlink:global
```

## 快速开始

### 1. 初始化全局应用目录

```bash
skm config init
```

该命令会创建：

- `~/.simple-skill-manager/config.json`
- `~/.simple-skill-manager/presets.yaml`
- `~/.simple-skill-manager/projects.json`
- `~/.simple-skill-manager/skills/`

### 2. 配置技能目录

```bash
skm config set skills-dir ~/my-skills
```

### 3. 查看当前配置

```bash
skm config get
```

### 4. 浏览可用技能

```bash
skm skill list
skm skill inspect brainstorming
```

### 5. 启用技能或预设

```bash
skm skill on brainstorming --target .agents
skm preset on frontend-basic --target .claude
```

### 6. 校准并排查问题

```bash
skm sync
skm doctor
```

## 命令总览

### `config`

| 命令 | 说明 |
| --- | --- |
| `skm config init` | 初始化全局应用目录和默认文件 |
| `skm config get` | 以 JSON 输出当前全局配置 |
| `skm config set skills-dir <path>` | 把 `skillsDir` 更新为一个已存在的目录 |

### `skill`

| 命令 | 说明 |
| --- | --- |
| `skm skill list` | 列出 `skillsDir` 中发现的全部技能 |
| `skm skill inspect [name]` | 显示单个技能的路径、frontmatter 和预览 |
| `skm skill on [names...] --target <target>` | 在当前项目中启用一个或多个技能 |
| `skm skill on [names...] --global --target <target>` | 在全局作用域启用一个或多个技能 |
| `skm skill off [names...]` | 禁用项目作用域的技能 |
| `skm skill off [names...] --global` | 禁用全局作用域的技能 |

### `preset`

| 命令 | 说明 |
| --- | --- |
| `skm preset list` | 列出所有已配置的预设 |
| `skm preset inspect [name]` | 显示某个预设展开后的技能列表 |
| `skm preset on [names...] --target <target>` | 在当前项目中启用一个或多个预设 |
| `skm preset on [names...] --global --target <target>` | 在全局作用域启用一个或多个预设 |
| `skm preset off [names...]` | 禁用项目作用域的预设 |
| `skm preset off [names...] --global` | 禁用全局作用域的预设 |
| `skm preset create [name] [skills...]` | 创建静态预设 |
| `skm preset update [name] [skills...]` | 用新的完整技能列表替换静态预设 |
| `skm preset rm [name]` | 从 `presets.yaml` 删除静态预设 |

### `sync`、`doctor` 和 `ui`

| 命令 | 说明 |
| --- | --- |
| `skm sync` | 让已安装目标与 `.skm/state.json` 保持一致 |
| `skm sync --global` | 让已安装目标与 `global-state.json` 保持一致 |
| `skm doctor` | 检查项目漂移、缺失源文件和损坏安装 |
| `skm doctor --global` | 检查全局漂移、缺失源文件和损坏安装 |
| `skm ui` | 启动本地 Web UI 服务 |
| `skm ui --port <port>` | 使用指定端口启动 Web UI |
| `skm ui --no-open` | 启动 Web UI 但不自动打开浏览器 |

## 预设

预设保存在 `~/.simple-skill-manager/presets.yaml`。

示例：

```yaml
frontend-basic:
  - brainstorming
  - test-engineer

researcher:
  - deep-research
  - url-to-markdown

design-review:
  - impeccable/overdrive
  - impeccable/polish
```

补充说明：

- 静态预设通过 `skm preset ...` 创建、更新和删除
- 一级作用域目录也会自动暴露为动态只读预设
- `skillsDir/impeccable/*/SKILL.md` 会生成名为 `impeccable` 的动态预设
- 动态预设会展开为 `impeccable/overdrive` 这类带作用域的技能名
- 如果静态预设名和动态作用域预设名冲突，命令会直接失败

## 安装布局

项目作用域安装位置：

```text
<project>/<target>/skills/<skill-name>
```

全局安装位置：

```text
~/<target>/skills/<skill-name>
```

Gemini 命令投影位置：

```text
<project>/.gemini/commands/<scope>/<skill>.toml
~/.gemini/commands/<scope>/<skill>.toml
```

规则说明：

- 支持的目标目录包括 `.agents`、`.trae`、`.kiro`、`.claude` 和 `.gemini`
- `skm` 优先使用符号链接，失败时回退为复制
- 最终使用的 `installMode` 会记录到状态文件里
- `.gemini` 使用生成的 `.toml` 文件，并把 `installMode` 记录为 `generated`

## 状态文件

| 路径 | 作用 |
| --- | --- |
| `~/.simple-skill-manager/config.json` | 全局配置，包含 `skillsDir` 和 `defaultTargets` |
| `~/.simple-skill-manager/presets.yaml` | 全局预设定义 |
| `~/.simple-skill-manager/projects.json` | 已知项目状态的镜像索引 |
| `~/.simple-skill-manager/global-state.json` | 全局激活状态的权威来源 |
| `.skm/state.json` | 项目本地激活状态的权威来源 |

相关行为：

- `skm skill on ...` 和 `skm preset on ...` 会创建或更新 `.skm/state.json`
- 这些命令也会确保 `.gitignore` 包含 `.skm`
- 命令成功时默认输出 JSON，除非 CLI 返回的是普通消息或错误信息

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 全局配置缺失 | 运行 `skm config init` |
| `skillsDir` 缺失或无效 | 用真实存在的目录重新执行 `skm config set skills-dir <path>` |
| 存在重复技能名 | 修复 `SKILL.md` frontmatter 中冲突的 `name` 字段 |
| `presets.yaml` 非法 | 修复 `~/.simple-skill-manager/presets.yaml`，确保每个预设都映射到字符串数组 |
| 某个目标路径被无关文件或目录占用 | 删除冲突项后重新执行 `skm sync` |

## 开发

```bash
pnpm run check
pnpm run build
node dist/skm.js --help
```

## 发布

```bash
pnpm run publish:verify
pnpm publish --dry-run
```

`pnpm publish` 会执行 `prepublishOnly`，而它会在发布前调用 `pnpm run publish:verify`。
