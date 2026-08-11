# Planning Conventions

Plans are local working artifacts under `docs/plans/` and are ignored by Git by default. Promote an individual plan deliberately with `git add -f` only when committed documentation must reference it.

## Layout

- `designs/`: durable design references with an explicit approval status.
- `work/`: executable plans with `Status: Active` or `Status: Completed`, progress notes, and a decision log.
- `work/tech-debt-tracker.md`: prioritized known constraints that are not silently treated as completed work.

## File Naming

Use a three-digit, zero-padded sequential prefix within each plan folder: `001-short-name.md`.

## Work Plan Template

```markdown
# Title

**Status**: Active
**Created**: YYYY-MM-DD

## Goal

## Constraints

## Tasks

## Decision Log

## Progress Notes
```
