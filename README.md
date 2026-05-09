# Quorum

On-chain HOA governance on the Internet Computer.

Quorum puts your homeowners association on-chain — proposals, votes, dues, documents, and community notices all stored as immutable canister state. No more emailed PDFs, lost meeting minutes, or disputed vote tallies.

## Features

| Module | What it does |
|---|---|
| **Members** | Unit registry, board roles, onboarding |
| **Governance** | Proposals, configurable quorum thresholds, immutable vote records |
| **Treasury** | Monthly dues, special assessments, fines, payment tracking |
| **Documents** | CC&Rs, bylaws, meeting minutes, budgets (IPFS CID or inline) |
| **Announcements** | Board notices with priority levels and expiry |

## Architecture

5 Motoko canisters, 1 React/TypeScript frontend, deployed on the Internet Computer.

```
backend/
  members/        — member registry, roles
  governance/     — proposals, voting
  treasury/       — dues, assessments
  documents/      — community documents
  announcements/  — notices and alerts
frontend/         — React + Vite SPA
scripts/
  deploy.sh       — deploys all canisters and wires IDs
```

All canisters use `persistent actor` (Motoko mo:core) — variables are implicitly stable, no upgrade hooks needed.

## Getting started

```bash
# Prerequisites: dfx, mops, node 18+

cp .env.example .env
dfx start --background
bash scripts/deploy.sh
cd frontend && npm run dev    # http://localhost:5173
```

## Development

```bash
dfx start --background        # local ICP replica
bash scripts/deploy.sh        # deploy all 5 canisters
cd frontend && npm run dev    # Vite dev server
cd frontend && npm run test:unit
```

## Roadmap

- [ ] Internet Identity authentication
- [ ] Email notifications via AI proxy canister
- [ ] Token-gated voting weight (one unit = one vote)
- [ ] Stripe integration for dues collection
- [ ] Mobile-responsive dashboard
- [ ] Resident portal (read-only view for renters)
