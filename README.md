# Acebedo Optical Inventory

A modular React and Supabase replacement for the legacy Acebedo Optical
inventory dashboard.

Production: [acebedo-inventory.vercel.app](https://acebedo-inventory.vercel.app)

## Quick start

```sh
npm install
cp .env.example .env.local
npm run supabase:start
npm run supabase:reset
npm run dev
```

The Vite development server runs at `http://localhost:8000`. The legacy
single-file implementation is preserved at `legacy/index.html`; it has not
been deleted or connected to the new application.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
supabase db lint
```

## Documentation

Start with [`docs/README.md`](docs/README.md). It links the architecture,
authorization and RLS model, local Supabase setup, imports/exports, first-admin
provisioning, data migration, deployment, backup, cutover, and rollback guides.

These local setup commands do not deploy or migrate production data. The
production Vercel project deploys from the GitHub repository's `main` branch.
