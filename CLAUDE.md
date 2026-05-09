# CLAUDE.md

## Commands

```bash
dfx start --background         # start local ICP replica
bash scripts/deploy.sh         # deploy all 5 canisters + frontend
cd frontend && npm run dev     # Vite dev server at :5173
cd frontend && npm run test:unit
```

## Architecture

5 Motoko canisters (`persistent actor`, mo:core). All variables are implicitly stable.

| Canister | Responsibility |
|---|---|
| members | Unit registry, board roles |
| governance | Proposals, voting |
| treasury | Dues, assessments, payments |
| documents | CC&Rs, meeting minutes, budgets |
| announcements | Community notices |

## Conventions

- No border-radius (sharp editorial corners)
- Inline styles, `const S = {...}` token block at top of each component
- Colors: ink `#0E0E0C`, paper `#F7F6F2`, rule `#C8C3B8`, accent `#2563EB`
- Fonts: IBM Plex Mono (labels/nav), IBM Plex Sans (body), Georgia (headings)
- Bump `DEPLOY_SCRIPT_VERSION` in `scripts/deploy.sh` on every change
- Update IDL factories in `frontend/src/services/` when Motoko types change
