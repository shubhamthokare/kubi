# Kubi Repository Governance Rules

These rules apply to all Codex work in this repository.

## Repository Structure Is Authoritative

The existing repository structure is the source of truth.

Do not reorganize, rename, move, or delete directories unless explicitly requested.

Before creating any file, inspect the existing repository and reuse the closest existing location.

## File Creation Policy

Default action:

- Modify existing files.
- Do not create new files unless absolutely required.

New files may only be created when:

- Implementing a genuinely new feature.
- Adding a required test.
- Adding a required deployment manifest.
- Adding a required configuration file.

For every new file created, explain why an existing file could not be modified instead.

## Directory Ownership

### Backend

Allowed code locations:

- `apps/backend/app/**`
- `apps/backend/tests/**`

Do not create backend code outside these directories.

### Frontend

Allowed code locations:

- `apps/frontend/src/**`
- `deploy/local/playwright/tests/**`

Do not create frontend code outside these directories.

### Agent

Allowed code locations:

- `apps/agent/**`
- `apps/agent/tests/**`

### Kubernetes

Allowed locations:

- `deploy/k8s/**`
- `deploy/helm/**`

Do not create Kubernetes manifests elsewhere.

### Documentation

Allowed locations:

- `docs/**`
- Existing README files

Do not create documentation outside `docs`.

## README Policy

Do not create additional README files.

Allowed README files:

- Existing repository README
- Existing service READMEs already present

When documentation changes:

- Update an existing README first.
- Create a document in `docs/` only if necessary.

## Forbidden Files

Never create:

- `PLAN.md`
- `IMPLEMENTATION.md`
- `DESIGN.md`
- `TASK.md`
- `REPORT.md`
- `SUMMARY.md`
- `NOTES.md`
- `ANALYSIS.md`
- `PROGRESS.md`
- `MIGRATION.md`

unless explicitly requested.

## Script Policy

Allowed locations:

- `deploy/scripts/**`
- Existing scripts directories
- Existing scratch directories

Do not create new script directories.

## Testing Policy

Backend changes:

- Add or update tests in `apps/backend/tests`.

Frontend changes:

- Add or update Playwright tests in `deploy/local/playwright/tests`.

Do not create duplicate test suites.

## Temporary Files

Do not create:

- temp files
- debug files
- log dumps
- generated reports

Use existing scratch directories only.

Remove temporary artifacts before task completion.

## Root Directory Protection

Do not create new top-level folders.

Do not place feature files in the repository root.

Only project-level configuration files are allowed at root.

## Architecture Protection

Do not:

- Introduce new services.
- Create new applications.
- Create new deployment systems.
- Create new package structures.

without explicit approval.

## Agent Output Policy

Provide:

- plans
- reports
- summaries
- migration notes
- implementation details

in chat only.

Do not write them as files.

## Completion Checklist

Before finishing:

1. Remove temporary files.
2. Remove unused imports.
3. Remove dead code.
4. Ensure tests pass.
5. Show test output.
6. Show logs for executed tasks.
7. Confirm repository structure was preserved.

## Golden Rule

Prefer modifying existing files over creating new files.

File creation is the exception, not the default behavior.
