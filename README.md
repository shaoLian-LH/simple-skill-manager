# simple-skill-manager

`simple-skill-manager` (`skm`) is a Node.js CLI for managing skill visibility in a local machine and linking selected skills into project targets such as `.agents` and `.trae`.

It does not execute skills. It only manages:
- the global skill registry location
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

## Examples

### 1. Initialize `skm` and set or update the global skills directory

First initialize the global config directory under `~/.simple-skill-manager/`:

```bash
skm config init
```

Then point `skm` at the directory that contains your global skills repository:

```bash
skm config set skills-dir ~/my-skills
```

If you later move to a different skills repository, run the same command again with the new path:

```bash
skm config set skills-dir /path/to/another-skill-repo
```

Inspect the effective config:

```bash
skm config get
```

Inspect the skills discovered from the configured repository:

```bash
skm skill list
skm skill inspect brainstorming
```

### 2. Configure presets and understand how a preset decides its skills

Presets are global definitions stored in `~/.simple-skill-manager/presets.yaml`.

Each preset is a simple mapping:
- key = preset name
- value = list of skill names

Example:

```yaml
frontend-basic:
  - brainstorming
  - test-engineer

researcher:
  - deep-research
  - url-to-markdown
```

In this model:
- enabling `frontend-basic` means enabling `brainstorming` and `test-engineer`
- enabling `researcher` means enabling `deep-research` and `url-to-markdown`
- presets do not contain paths or targets; they only decide which skill names should be expanded

After editing `presets.yaml`, inspect what `skm` sees:

```bash
skm preset list
skm preset inspect frontend-basic
skm preset inspect researcher
```

### 3. Enable or disable a preset or skill inside a project

Inside a project directory, enable a single skill:

```bash
skm enable skill brainstorming --target .agents
```

Enable a single skill into multiple targets:

```bash
skm enable skill brainstorming --target .agents --target .trae
```

Enable a preset, which expands to the skills listed in `presets.yaml`:

```bash
skm enable preset frontend-basic --target .agents
```

Disable a single explicitly enabled skill:

```bash
skm disable skill brainstorming
```

Disable a preset:

```bash
skm disable preset frontend-basic
```

Check and repair project drift:

```bash
skm doctor
skm sync
```

When `enable` runs, `skm` will:
- create or update `.skm/state.json`
- append `.skm` to `.gitignore` if needed
- install skills into `.agents/skills/<name>` or `.trae/skills/<name>`
- update the global mirror index in `~/.simple-skill-manager/projects.json`

## State files

Global files live under `~/.simple-skill-manager/`:
- `config.json`: global settings including `skillsDir`
- `presets.yaml`: preset name to skill-name array mapping
- `projects.json`: mirror index of project state

Project-local state lives under `.skm/`:
- `.skm/state.json`: authoritative project state

When `skm enable ...` runs, it also ensures `.gitignore` contains `.skm`.

## Installation behavior

For each enabled target, skills are installed to:

```text
<project>/<target>/skills/<skill-name>
```

Install mode behavior:
- prefer symlink
- fall back to copy when symlink creation fails
- record the resulting `installMode` in `.skm/state.json`
- preserve the recorded mode on later syncs

## Common failures

- Missing global config: run `skm config init`
- Missing or invalid `skillsDir`: run `skm config set skills-dir <path>` with an existing directory
- Duplicate skill names: fix conflicting `name` fields in `SKILL.md` frontmatter
- Invalid presets YAML: repair `~/.simple-skill-manager/presets.yaml`
- Target conflict: remove the unknown file or directory that already occupies `<target>/skills/<skill-name>`

## Development checks

```bash
npm run check
npm run build
node dist/skm.js --help
```
