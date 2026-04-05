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

## Global initialization

Initialize the global config directory under `~/.simple-skill-manager/`:

```bash
skm config init
```

Set the directory that contains your global skills repository:

```bash
skm config set skills-dir ~/my-skills
```

Inspect the resulting configuration:

```bash
skm config get
```

## Skill and preset discovery

List and inspect discovered skills:

```bash
skm skill list
skm skill inspect brainstorming
```

List and inspect presets from `~/.simple-skill-manager/presets.yaml`:

```bash
skm preset list
skm preset inspect frontend-basic
```

## Project workflow

Enable a single skill into one or more targets:

```bash
skm enable skill brainstorming --target .agents
skm enable skill brainstorming --target .agents --target .trae
```

Enable a preset:

```bash
skm enable preset frontend-basic --target .agents
```

Disable a skill or preset:

```bash
skm disable skill brainstorming
skm disable preset frontend-basic
```

Inspect and repair project drift:

```bash
skm doctor
skm sync
```

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
