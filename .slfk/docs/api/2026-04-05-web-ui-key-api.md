# Web UI Key API

Last refreshed: 2026-04-05

## CLI Entry

- `skm ui [--port <n>] [--no-open]`
- Local-only server on `127.0.0.1`
- Default port: `11451`
- Bounded automatic port fallback when the preferred port is occupied

## Response Envelope

Success:

```json
{ "ok": true, "data": { } }
```

Error:

```json
{ "ok": false, "error": { "kind": "usage|config|conflict|runtime", "message": "...", "details": "...", "hint": "...", "fieldErrors": { "field": "message" } } }
```

HTTP status mapping:

- `usage` -> `400`
- `config` -> `400`
- `conflict` -> `409`
- `runtime` -> `500`

## projectId Compatibility

- Route key format: `p_` + `base64url(absoluteProjectPath)`
- Back end remains path-based internally; front end only uses `projectId` in URLs

## Read APIs

- `GET /api/dashboard` -> totals, recent projects, global quick actions
- `GET /api/config` -> `ConfigView`
- `GET /api/projects` -> `ProjectSummaryView[]`
- `GET /api/projects/:projectId` -> `ProjectDetailView`
- `GET /api/presets` -> `PresetsView`
- `GET /api/presets/:name/delete-preview` -> `PresetDeletePreviewView`
- `GET /api/skills` -> `SkillsView`
- `GET /api/launch-status` -> `LaunchStatusView`

## Mutation / Action APIs

- `POST /api/config` -> updated `ConfigView`
- `POST /api/projects/:projectId/skills/enable` -> refreshed `ProjectDetailView`
- `POST /api/projects/:projectId/skills/disable` -> refreshed `ProjectDetailView`
- `POST /api/projects/:projectId/presets/enable` -> refreshed `ProjectDetailView`
- `POST /api/projects/:projectId/presets/disable` -> refreshed `ProjectDetailView`
- `POST /api/projects/:projectId/quick-open` -> `QuickOpenView`
- `POST /api/presets` -> refreshed `PresetsView`
- `PUT /api/presets/:name` -> refreshed `PresetsView`
- `DELETE /api/presets/:name` -> `PresetDeleteView` + refreshed preset list

## Key DTOs

- `LaunchStatusView`: `host`, `requestedPort`, `port`, `usedPortFallback`, `url`, browser-open state
- `ConfigView`: `skillsDir`, `defaultTargets`, `supportedTargets`, `quickActions`, `paths`
- `ProjectSummaryView`: `projectId`, `projectPath`, `targets`, enabled counts, `updatedAt`
- `ProjectDetailView`: `enabledPresets`, `enabledSkills`, `resolvedSkills`, `quickActions`, project metadata
- `PresetsView`: `items`, `quickActions`
- `PresetDeletePreviewView`: preset name, reference count, referencing projects
- `PresetDeleteView`: deleted preset summary plus refreshed preset list
- `QuickOpenView`: `success`, `strategy`, `message`

## Source of Truth

- Contracts: `src/ui/contracts/api.ts`
- Route handling: `src/ui/server/app.ts`
- Data assembly / mutation orchestration: `src/ui/facade/service.ts`
- CLI entry: `src/cli/program.ts`
