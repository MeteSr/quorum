# CLAUDE.md

## Commands

```bash
icp network start -d                     # start local ICP network
bash scripts/deploy.sh                   # deploy all 6 canisters + frontend
cd frontend && npm run dev               # Vite dev server at :5173

# Frontend tests
cd frontend && npm run test:unit         # vitest unit tests (service + store)
cd frontend && npm run test:unit:coverage

# Backend integration tests (requires deployed canisters)
bash scripts/test-backend.sh            # run all canister test suites in parallel
bash scripts/test-backend.sh members    # run one canister's suite
bash backend/maintenance/test.sh        # run a single test file directly
```

## Architecture

9 Motoko canisters (`persistent actor`, mo:core). All variables are implicitly stable.

| Canister | Responsibility |
|---|---|
| members | Unit registry, board roles, invite codes |
| governance | Proposals, voting |
| treasury | Dues, assessments, payments |
| documents | CC&Rs, meeting minutes, budgets |
| announcements | Community notices |
| maintenance | Maintenance requests, assignment, audit trail, SLA |
| violations | Violation reports, replies, status workflow |
| meetings | Meeting records, agenda, attendance, motions, minutes |
| calendar | Community calendar, events, iCal feed via http_request |

## Conventions

- No border-radius (sharp editorial corners)
- Inline styles, `const S = {...}` token block at top of each component
- Colors: ink `#0E0E0C`, paper `#F7F6F2`, rule `#C8C3B8`, accent `#2563EB`
- Fonts: IBM Plex Mono (labels/nav), IBM Plex Sans (body), Georgia (headings)
- Bump `DEPLOY_SCRIPT_VERSION` in `scripts/deploy.sh` on every change
- Update IDL factories in `frontend/src/services/` when Motoko types change
