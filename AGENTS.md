# OpenCode Windows Notifications

> Windows-only OpenCode server plugin for privacy-safe native toast notifications.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for domains, dependency flow, and integration boundaries.

## Documentation

- [Design Docs](docs/design-docs/index.md) - verified architectural decisions and operating beliefs.
- [Product Specs](docs/product-specs/index.md) - user-visible behavior and acceptance criteria.
- [References](docs/references/) - curated external-library material when needed.
- [Plans](docs/plans/) - local design references and execution plans.

## Domain Guides

- [Reliability](docs/RELIABILITY.md) - failure containment and operational behavior.
- [Security](docs/SECURITY.md) - host, process, and data-boundary controls.
- [Product Sense](docs/PRODUCT-SENSE.md) - user attention, privacy, and scope principles.

## Quality And Planning

- [Quality Score](docs/QUALITY-SCORE.md) - current grades and known gaps.
- [Code Review](docs/CODE-REVIEW.md) - review checklist and severity definitions.
- [Plan Conventions](docs/PLANS.md) - local plan lifecycle and template.
- [Tech Debt](docs/plans/work/tech-debt-tracker.md) - prioritized unresolved constraints.

## Project Structure

- [Plugin Package](packages/opencode-windows-notifications/AGENTS.md) - package-specific integration and safety constraints.
- The root contains the product requirements and package-level publishing metadata.

## Quick Rules

- Keep the dependency direction: host adapter -> eligibility -> transport -> Windows Runtime.
- Never expose dynamic host data in toast content, PowerShell source, or diagnostics.
- Treat every host-adjacent failure as fail-open; do not add retries or fallback transports.
- Reject subagent, unresolved, malformed, and unstable event inputs before delivery.
- Preserve Windows-only runtime inertness and the documented OpenCode plugin contract.

<!-- MANUAL: Notes below this line are preserved on regeneration -->
