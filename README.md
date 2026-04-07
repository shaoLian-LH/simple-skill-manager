# simple-skill-manager

`simple-skill-manager` (`skm`) is a Node.js CLI for managing local skill visibility and linking selected skills into project targets such as `.agents` and `.trae`.

It does not execute skills. It manages:
- the global skills directory
- preset definitions
- project-local `.skm/state.json`
- target installation via symlink with copy fallback

## Requirements

- Node.js 20+

## Install for local development

```bash
npm install
npm run build
node dist/skm.js --help
```

The packaged CLI entry is exposed through `package.json#bin` as `skm`.

## Initial setup

Initialize the global app directory under `~/.simple-skill-manager/`:

```bash
skm config init
```

Point `skm` at the directory that contains your skill folders:

```bash
skm config set skills-dir ~/my-skills
```

Check the effective config:

```bash
skm config get
```

`config init` creates:
- `~/.simple-skill-manager/config.json`
- `~/.simple-skill-manager/presets.yaml`
- `~/.simple-skill-manager/projects.json`
- `~/.simple-skill-manager/skills/` as the default local skills directory

Once setup is done, everything below is a command quick reference.

## Command quick reference

### `config`

| Command | Purpose | Example / note |
| --- | --- | --- |
| `skm config init` | Create the global app directory and default files. | Run this first on a new machine. |
| `skm config get` | Print the current global config as JSON. | `skm config get` |
| `skm config set skills-dir <path>` | Update `skillsDir` to an existing directory. | `skm config set skills-dir ~/my-skills` |

### `skill`

| Command | Purpose | Example / note |
| --- | --- | --- |
| `skm skill list` | List all discovered skills from the configured `skillsDir`, including scoped skills. | `skm skill list` |
| `skm skill inspect [name]` | Show the source path, frontmatter, and body preview for one skill. | `skm skill inspect brainstorming` |
| `skm skill enable [names...] --target <target>` | Enable one or more skills in the current project and install them into one or more targets. | `skm skill enable brainstorming --target .agents` |
| `skm skill disable [names...]` | Disable explicitly enabled skills in the current project. | `skm skill disable brainstorming` |

Quick notes:
- Repeat `--target` to install into multiple targets: `--target .agents --target .trae`
- If the project already has recorded targets, interactive flows reuse them as defaults; otherwise the global default target is `.agents`
- In a TTY session, commands with optional names can prompt you to select entries interactively
- One-level scoped skills are supported as `<scope>/<skill>`. Example: `impeccable/overdrive` resolves from `skillsDir/impeccable/overdrive/SKILL.md`

### `preset`

| Command | Purpose | Example / note |
| --- | --- | --- |
| `skm preset list` | List all configured presets. | `skm preset list` |
| `skm preset inspect [name]` | Show the skill list expanded from one preset. | `skm preset inspect frontend-basic` |
| `skm preset enable [names...] --target <target>` | Enable one or more presets in the current project. | `skm preset enable frontend-basic --target .agents` |
| `skm preset disable [names...]` | Disable one or more presets in the current project. | `skm preset disable frontend-basic` |
| `skm preset add [name] [skills...]` | Create a preset with a non-empty skill list. | `skm preset add frontend-basic brainstorming test-engineer` |
| `skm preset update [name] [skills...]` | Replace the full skill list for an existing preset. | `skm preset update frontend-basic brainstorming` |
| `skm preset delete [name]` | Delete a preset from global `presets.yaml`. | `skm preset delete frontend-basic` |

Quick notes:
- Presets live in `~/.simple-skill-manager/presets.yaml`
- Each preset is `preset-name -> [skill-name, ...]`
- `skm preset enable ...` expands preset names into the skill names stored in `presets.yaml`
- `skm preset delete ...` warns when the preset is still referenced by project state
- One-level scope directories also become dynamic read-only presets. Example: `skillsDir/impeccable/*/SKILL.md` exposes a dynamic preset named `impeccable`
- Dynamic presets expand to scoped skill names such as `impeccable/overdrive`
- Dynamic presets are discoverable through `preset list` / `preset inspect`, but `preset add/update/delete` only works for static presets in `presets.yaml`
- If a static preset name collides with a dynamic scope preset name, `skm` fails fast with a conflict error

Example `presets.yaml`:

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

### `sync` and `doctor`

| Command | Purpose | Example / note |
| --- | --- | --- |
| `skm sync` | Reconcile installed target entries so they match `.skm/state.json`. | Run after fixing missing files or target drift. |
| `skm doctor` | Inspect project drift, missing sources, stale index entries, broken links, and missing preset definitions. | `skm doctor` |

## State and files

| Path | Purpose |
| --- | --- |
| `~/.simple-skill-manager/config.json` | Global config, including `skillsDir` and `defaultTargets` |
| `~/.simple-skill-manager/presets.yaml` | Global preset definitions |
| `~/.simple-skill-manager/projects.json` | Mirror index of known project state |
| `.skm/state.json` | Authoritative project-local state |

Related behavior:
- `skm skill enable ...` and `skm preset enable ...` create or update `.skm/state.json`
- Those commands also ensure `.gitignore` contains `.skm`
- Successful command output is JSON unless the CLI is returning a plain message or error

## Install behavior

Skills are installed per target at:

```text
<project>/<target>/skills/<skill-name>
```

Install rules:
- supported targets are `.agents` and `.trae`
- `skm` prefers symlinks
- it falls back to copying when symlink creation fails
- the chosen `installMode` is recorded in `.skm/state.json`
- later syncs preserve the recorded install mode

## Common failures

| Problem | Fix |
| --- | --- |
| Global config is missing | Run `skm config init` |
| `skillsDir` is missing or invalid | Run `skm config set skills-dir <path>` with an existing directory |
| Duplicate skill names exist | Fix conflicting `name` fields in `SKILL.md` frontmatter |
| `presets.yaml` is invalid | Repair `~/.simple-skill-manager/presets.yaml` so each preset maps to a string array |
| A target path is already occupied by an unrelated file or directory | Remove the conflicting entry at `<target>/skills/<skill-name>` and run `skm sync` again |

## Development

```bash
npm run check
npm run build
node dist/skm.js --help
```
