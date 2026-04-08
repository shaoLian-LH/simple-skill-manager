# simple-skill-manager

[English](./README.md) | [简体中文](./README.zh-CN.md)

`simple-skill-manager` (`skm`) is a Node.js CLI for managing local skills and linking selected skills into project-level or global target directories such as `.agents`, `.trae`, `.kiro`, `.claude`, and `.gemini`.

It does not execute skills. It helps you organize skill visibility, activation state, and target installation.

## Features

- Manage a global `skillsDir` and discover local skills automatically
- Enable or disable skills in project scope or global scope
- Group skills with reusable presets
- Install into multiple targets with symlink-first behavior and copy fallback
- Reconcile drift with `sync` and diagnose issues with `doctor`
- Generate `.gemini` command projections automatically
- Launch a local Web UI with `skm ui`

## Requirements

- Node.js 20+
- pnpm 10+

## Installation

### Local development

```bash
pnpm install
pnpm run build
node dist/skm.js --help
```

The packaged CLI is exposed as `skm` through `package.json#bin`.

### Link as a global CLI during development

```bash
pnpm run link:global
skm --help
pnpm run unlink:global
```

## Quick Start

### 1. Initialize the global app directory

```bash
skm config init
```

This creates:

- `~/.simple-skill-manager/config.json`
- `~/.simple-skill-manager/presets.yaml`
- `~/.simple-skill-manager/projects.json`
- `~/.simple-skill-manager/skills/`

### 2. Point `skm` to your skills directory

```bash
skm config set skills-dir ~/my-skills
```

### 3. Check the effective config

```bash
skm config get
```

### 4. Explore available skills

```bash
skm skill list
skm skill inspect brainstorming
```

### 5. Enable skills or presets

```bash
skm skill enable brainstorming --target .agents
skm preset enable frontend-basic --target .claude
```

### 6. Keep installations healthy

```bash
skm sync
skm doctor
```

## Commands

### `config`

| Command | Description |
| --- | --- |
| `skm config init` | Initialize the global app directory and default files |
| `skm config get` | Print the current global config as JSON |
| `skm config set skills-dir <path>` | Update `skillsDir` to an existing directory |

### `skill`

| Command | Description |
| --- | --- |
| `skm skill list` | List all discovered skills from `skillsDir` |
| `skm skill inspect [name]` | Show one skill's path, frontmatter, and preview |
| `skm skill enable [names...] --target <target>` | Enable one or more skills in the current project |
| `skm skill enable [names...] --global --target <target>` | Enable one or more skills in global scope |
| `skm skill disable [names...]` | Disable project-scoped skills |
| `skm skill disable [names...] --global` | Disable globally enabled skills |

### `preset`

| Command | Description |
| --- | --- |
| `skm preset list` | List all configured presets |
| `skm preset inspect [name]` | Show the expanded skill list for one preset |
| `skm preset enable [names...] --target <target>` | Enable one or more presets in the current project |
| `skm preset enable [names...] --global --target <target>` | Enable one or more presets in global scope |
| `skm preset disable [names...]` | Disable project-scoped presets |
| `skm preset disable [names...] --global` | Disable globally enabled presets |
| `skm preset create [name] [skills...]` | Create a static preset |
| `skm preset update [name] [skills...]` | Replace a static preset's full skill list |
| `skm preset delete [name]` | Delete a static preset from `presets.yaml` |

### `sync`, `doctor`, and `ui`

| Command | Description |
| --- | --- |
| `skm sync` | Reconcile installed targets with `.skm/state.json` |
| `skm sync --global` | Reconcile installed targets with `global-state.json` |
| `skm doctor` | Inspect project drift, missing sources, and broken installs |
| `skm doctor --global` | Inspect global drift, missing sources, and broken installs |
| `skm ui` | Start the local Web UI server |
| `skm ui --port <port>` | Start the Web UI on a preferred local port |
| `skm ui --no-open` | Start the Web UI without opening a browser |

## Presets

Presets live in `~/.simple-skill-manager/presets.yaml`.

Example:

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

Notes:

- Static presets are created, updated, and deleted through `skm preset ...`
- One-level scope directories also become dynamic read-only presets
- `skillsDir/impeccable/*/SKILL.md` exposes a dynamic preset named `impeccable`
- Dynamic presets expand to scoped skill names such as `impeccable/overdrive`
- Name collisions between static presets and dynamic scope presets fail fast

## Installation Layout

Project-scoped installs:

```text
<project>/<target>/skills/<skill-name>
```

Global installs:

```text
~/<target>/skills/<skill-name>
```

Gemini command projections:

```text
<project>/.gemini/commands/<scope>/<skill>.toml
~/.gemini/commands/<scope>/<skill>.toml
```

Rules:

- Supported targets are `.agents`, `.trae`, `.kiro`, `.claude`, and `.gemini`
- `skm` prefers symlinks and falls back to copying when needed
- The chosen `installMode` is recorded in state
- `.gemini` uses generated `.toml` files and records `installMode` as `generated`

## State Files

| Path | Purpose |
| --- | --- |
| `~/.simple-skill-manager/config.json` | Global config including `skillsDir` and `defaultTargets` |
| `~/.simple-skill-manager/presets.yaml` | Global preset definitions |
| `~/.simple-skill-manager/projects.json` | Mirror index of known project state |
| `~/.simple-skill-manager/global-state.json` | Authoritative global activation state |
| `.skm/state.json` | Authoritative project-local activation state |

Related behavior:

- `skm skill enable ...` and `skm preset enable ...` create or update `.skm/state.json`
- Those commands also ensure `.gitignore` contains `.skm`
- Successful command output is JSON unless the CLI returns a plain message or an error

## Common Issues

| Problem | Fix |
| --- | --- |
| Global config is missing | Run `skm config init` |
| `skillsDir` is missing or invalid | Run `skm config set skills-dir <path>` with an existing directory |
| Duplicate skill names exist | Fix conflicting `name` fields in `SKILL.md` frontmatter |
| `presets.yaml` is invalid | Repair `~/.simple-skill-manager/presets.yaml` so each preset maps to a string array |
| A target path is occupied by an unrelated file or directory | Remove the conflicting entry and run `skm sync` again |

## Development

```bash
pnpm run check
pnpm run build
node dist/skm.js --help
```

## Publish

```bash
pnpm run publish:verify
pnpm publish --dry-run
```

`pnpm publish` runs `prepublishOnly`, which calls `pnpm run publish:verify` before publishing.
