# simple-skill-manager

`simple-skill-manager`（`skm`）是一个 Node.js CLI，用来管理本地技能的可见性，并把选中的技能链接到项目级或全局目标目录中，例如 `.agents`、`.trae`、`.kiro`、`.claude` 和 `.gemini`。

它不会执行技能。它负责管理：
- 全局技能目录
- 预设定义
- 项目本地的 `.skm/state.json`
- 全局的 `~/.simple-skill-manager/global-state.json`
- 通过符号链接安装目标内容，并在失败时回退为复制
- 自动生成 Gemini 命令投影文件

## 环境要求

- Node.js 20+

## 本地开发安装

```bash
pnpm install
pnpm run build
node dist/skm.js --help
```

打包后的 CLI 入口通过 `package.json#bin` 暴露为 `skm`。

如果你想在开发期间把本地包暴露成全局 CLI，可以执行：

```bash
pnpm run link:global
skm --help
pnpm run unlink:global
```

## 初始化配置

先在 `~/.simple-skill-manager/` 下初始化全局应用目录：

```bash
skm config init
```

然后把 `skm` 指向存放技能目录的路径：

```bash
skm config set skills-dir ~/my-skills
```

查看当前生效配置：

```bash
skm config get
```

`config init` 会创建：
- `~/.simple-skill-manager/config.json`
- `~/.simple-skill-manager/presets.yaml`
- `~/.simple-skill-manager/projects.json`
- `~/.simple-skill-manager/skills/`（默认的本地技能目录）

完成初始化后，下面的内容就是命令速查表。

## 命令速查

### `config`

| 命令 | 作用 | 示例 / 说明 |
| --- | --- | --- |
| `skm config init` | 创建全局应用目录和默认文件。 | 新机器上先运行这个命令。 |
| `skm config get` | 以 JSON 输出当前全局配置。 | `skm config get` |
| `skm config set skills-dir <path>` | 把 `skillsDir` 更新为一个已存在的目录。 | `skm config set skills-dir ~/my-skills` |

### `skill`

| 命令 | 作用 | 示例 / 说明 |
| --- | --- | --- |
| `skm skill list` | 列出 `skillsDir` 中发现的全部技能，包括带作用域的技能。 | `skm skill list` |
| `skm skill inspect [name]` | 显示单个技能的源路径、frontmatter 和正文预览。 | `skm skill inspect brainstorming` |
| `skm skill enable [names...] --target <target>` | 在当前项目中启用一个或多个技能，并安装到一个或多个目标目录。 | `skm skill enable brainstorming --target .agents` |
| `skm skill enable [names...] --global --target <target>` | 在全局范围启用一个或多个技能。 | `skm skill enable brainstorming --global --target .claude` |
| `skm skill disable [names...]` | 在当前项目中禁用显式启用的技能。 | `skm skill disable brainstorming` |
| `skm skill disable [names...] --global` | 在全局范围禁用显式启用的技能。 | `skm skill disable brainstorming --global` |

补充说明：
- 通过重复传入 `--target` 可以安装到多个目标：`--target .agents --target .trae`
- 如果项目里已经记录过目标目录，交互式流程会把它们作为默认值；否则全局默认目标是 `.agents`
- 全局启用流程不会读取 `config.defaultTargets`；需要显式传入 `--global`，然后为全局作用域选择或提供目标
- 在 TTY 会话中，带可选名称参数的命令可以进入交互式选择
- 支持一级作用域技能，格式为 `<scope>/<skill>`。例如：`impeccable/overdrive` 会解析到 `skillsDir/impeccable/overdrive/SKILL.md`
- `.gemini` 的安装结果不是链接出来的技能目录，而是生成的命令文件

### `preset`

| 命令 | 作用 | 示例 / 说明 |
| --- | --- | --- |
| `skm preset list` | 列出所有已配置的预设。 | `skm preset list` |
| `skm preset inspect [name]` | 显示某个预设展开后的技能列表。 | `skm preset inspect frontend-basic` |
| `skm preset enable [names...] --target <target>` | 在当前项目中启用一个或多个预设。 | `skm preset enable frontend-basic --target .agents` |
| `skm preset enable [names...] --global --target <target>` | 在全局范围启用一个或多个预设。 | `skm preset enable frontend-basic --global --target .gemini` |
| `skm preset disable [names...]` | 在当前项目中禁用一个或多个预设。 | `skm preset disable frontend-basic` |
| `skm preset disable [names...] --global` | 在全局范围禁用一个或多个预设。 | `skm preset disable frontend-basic --global` |
| `skm preset create [name] [skills...]` | 创建一个包含非空技能列表的预设。 | `skm preset create frontend-basic brainstorming test-engineer` |
| `skm preset update [name] [skills...]` | 用新的完整技能列表替换已有预设。 | `skm preset update frontend-basic brainstorming` |
| `skm preset delete [name]` | 从全局 `presets.yaml` 中删除一个预设。 | `skm preset delete frontend-basic` |

补充说明：
- 预设保存在 `~/.simple-skill-manager/presets.yaml`
- 每个预设的结构都是 `preset-name -> [skill-name, ...]`
- `skm preset enable ...` 会把预设名展开为 `presets.yaml` 中定义的技能名列表
- `skm preset delete ...` 在预设仍被项目状态引用时会给出警告
- 一级作用域目录也会自动暴露为动态只读预设。例如：`skillsDir/impeccable/*/SKILL.md` 会产生一个名为 `impeccable` 的动态预设
- 动态预设会展开成类似 `impeccable/overdrive` 这样的带作用域技能名
- 动态预设可以通过 `preset list` / `preset inspect` 发现，但 `preset create/update/delete` 只作用于 `presets.yaml` 中的静态预设
- 如果静态预设名和动态作用域预设名冲突，`skm` 会立刻报错并终止

`presets.yaml` 示例：

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

### `sync` 和 `doctor`

| 命令 | 作用 | 示例 / 说明 |
| --- | --- | --- |
| `skm sync` | 校准已安装的目标目录内容，使其与 `.skm/state.json` 保持一致。 | 修复缺失文件或目标漂移后运行。 |
| `skm sync --global` | 校准已安装的目标目录内容，使其与 `global-state.json` 保持一致。 | 修复全局作用域的缺失文件或目标漂移后运行。 |
| `skm doctor` | 检查项目漂移、源文件缺失、过期索引、损坏链接以及缺失的预设定义。 | `skm doctor` |
| `skm doctor --global` | 检查全局漂移、源文件缺失、损坏链接以及缺失的预设定义。 | `skm doctor --global` |

## 状态文件与目录

| 路径 | 作用 |
| --- | --- |
| `~/.simple-skill-manager/config.json` | 全局配置，包含 `skillsDir` 和 `defaultTargets` |
| `~/.simple-skill-manager/presets.yaml` | 全局预设定义 |
| `~/.simple-skill-manager/projects.json` | 已知项目状态的镜像索引 |
| `~/.simple-skill-manager/global-state.json` | 全局激活状态的权威来源 |
| `.skm/state.json` | 项目本地状态的权威来源 |

相关行为：
- `skm skill enable ...` 和 `skm preset enable ...` 会创建或更新 `.skm/state.json`
- 这些命令也会确保 `.gitignore` 中包含 `.skm`
- 命令成功时默认输出 JSON，除非 CLI 返回的是普通消息或错误信息

## 安装行为

项目作用域的安装位置：

```text
<project>/<target>/skills/<skill-name>
```

全局技能目录的安装位置：

```text
~/<target>/skills/<skill-name>
```

Gemini 命令的安装位置：

```text
<project>/.gemini/commands/<scope>/<skill>.toml
~/.gemini/commands/<scope>/<skill>.toml
```

安装规则：
- 支持的目标目录为 `.agents`、`.trae`、`.kiro`、`.claude` 和 `.gemini`
- `skm` 优先使用符号链接
- 如果创建符号链接失败，会自动回退为复制
- 最终选用的 `installMode` 会记录到 `.skm/state.json`
- 后续执行 `sync` 时会沿用之前记录的安装模式
- `.gemini` 使用生成的 `.toml` 文件，并把 `installMode` 记录为 `generated`

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 全局配置缺失 | 运行 `skm config init` |
| `skillsDir` 缺失或无效 | 使用一个真实存在的目录重新执行 `skm config set skills-dir <path>` |
| 存在重复的技能名 | 修复 `SKILL.md` frontmatter 中冲突的 `name` 字段 |
| `presets.yaml` 非法 | 修复 `~/.simple-skill-manager/presets.yaml`，确保每个预设都映射到字符串数组 |
| 某个目标路径已被无关文件或目录占用 | 删除 `<target>/skills/<skill-name>` 处的冲突项，然后重新运行 `skm sync` |

## 开发

```bash
pnpm run check
pnpm run build
node dist/skm.js --help
```

## 发布流程

```bash
pnpm run publish:verify
pnpm publish --dry-run
```

`pnpm publish` 会自动执行 `prepublishOnly`，而它会调用 `pnpm run publish:verify`，在发布前依次完成测试、类型检查和构建。
