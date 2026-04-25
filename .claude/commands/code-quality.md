Run a comprehensive code quality sweep. Focus area: $ARGUMENTS

## Instructions

Parse the focus area from the arguments. If no argument, default to `general`.

### Focus Areas & Agent Routing

| Focus | Agents to Spawn | Purpose |
|-------|-----------------|---------|
| `general` | multiuser-security, test-auditor, code-hygiene, validation-gates | Full sweep |
| `security` | multiuser-security, code-hygiene (hardcoded + error-handling) | Security vulnerabilities |
| `testing` | test-auditor, validation-gates | Test coverage gaps, type errors |
| `architecture` | code-hygiene (modularization), validation-gates | Structural violations |
| `dead-code` | code-hygiene (dead-code only) | Unused code cleanup |
| `dst` | (manual — no agent) Audit any new code that uses `getDay`/`getHours`/`new Date(date)` against the Pacific-wall-clock convention | Tier/scheduler/invoice timezone bugs |

### Process

1. **Spawn agents in parallel** based on the focus area
2. Each agent runs **read-only** — reports findings but does NOT modify code
3. **Wait for all agents** to complete
4. **Consolidate findings** into a single report

### Consolidated Report Format

```
## Code Quality Sweep — [focus area]

### Findings by Severity

| # | Severity | Category | File | Line | Issue | Agent | Recommendation |
|---|----------|----------|------|------|-------|-------|----------------|

### Summary
- Agents run: [list]
- Total findings: N (N critical, N high, N medium, N low)

### Quick Wins (can fix immediately)
- [ ] Item 1

### Refactoring Items (need planning)
- [ ] Item 1
```

### Deduplication Rules

When multiple agents flag the same file:line:
- Keep the finding with the highest severity
- Merge recommendations from all agents
- Note which agents independently found it (higher confidence)

### Rules

- **All agents are read-only** — no code modifications
- **No false positives** — agents must verify by reading actual code
- **Respect CLAUDE.md** conventions (RBAC over role checks, ES modules in backend, Pacific wall-clock for tier lookups, etc.)
