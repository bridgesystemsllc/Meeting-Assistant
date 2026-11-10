# PREP Implementation Plan: SPEC-MA-PROD-V1

**Date:** 2026-11-10  
**Spec Version:** r1.0  
**Target:** Multi-tenant, white-label, consent-first meeting notetaker

---

## 1. Goal (Restated)

Transform the prototype into a production-ready multi-tenant SaaS:
- Tenant admins brand the product (logo, colors, bot name)
- Seat-holders send bots to meetings and get AI-generated notes
- Consent is enforced: bot name discloses recording, in-call announcement, auto-leave on denial
- Transcript-only: no audio stored; Recall media deleted after transcription
- Per-seat pricing with server-enforced seat limits

---

## 2. Target Monorepo Layout

```
meeting-assistant/
├── apps/
│   ├── api/                    # Express/Fastify TypeScript API
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   ├── routes/
│   │   │   │   ├── meetings.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   ├── tenant.ts
│   │   │   │   ├── auth.ts
│   │   │   │   └── health.ts
│   │   │   ├── services/
│   │   │   │   ├── recall.ts
│   │   │   │   ├── transcription.ts
│   │   │   │   ├── analysis.ts
│   │   │   │   └── email.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── tenant.ts
│   │   │   │   └── errors.ts
│   │   │   └── lib/
│   │   │       ├── db.ts
│   │   │       ├── redis.ts
│   │   │       └── logger.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── worker/                 # BullMQ worker
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── jobs/
│   │   │   │   ├── process-meeting.ts
│   │   │   │   ├── reconciler.ts
│   │   │   │   └── retention-purge.ts
│   │   │   └── lib/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                    # React + Vite + TypeScript
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── routes/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── styles/
│       ├── index.html
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                 # Shared types and schemas
│       ├── src/
│       │   ├── index.ts
│       │   ├── recall.ts       # RECALL_EVENT_TO_STATUS mapping
│       │   ├── analysis.ts     # Zod schemas for Claude output
│       │   ├── api.ts          # API request/response types
│       │   └── db.ts           # Database entity types
│       ├── package.json
│       └── tsconfig.json
│
├── db/
│   └── migrations/             # node-pg-migrate
│       ├── 001_initial.sql
│       ├── 002_tenants.sql
│       ├── 003_rls.sql
│       └── ...
│
├── .github/
│   └── workflows/
│       └── ci.yml              # Lint, typecheck, test, build
│
├── package.json                # Workspace root
├── turbo.json                  # Turborepo config
└── .env.example
```

**Framework Decisions:**
- **HTTP:** Express 4/5 with TypeScript (familiar, proven; Fastify optional upgrade later)
- **Queue:** BullMQ (jobId dedupe, DLQ, better than Bull v3)
- **Migrations:** node-pg-migrate (simple, SQL-based; Drizzle optional upgrade later)
- **Frontend:** React + Vite + TS (faster builds than Next.js, simpler for dashboard SPA)

---

## 3. Phase-by-Phase Plan

### Phase 1: E2E Pipeline Fix

**Goal:** Restructure to monorepo, fix webhooks, establish durable processing pipeline.

#### Backend Files

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/index.ts` | CREATE | Express entry with middleware |
| `apps/api/src/routes/meetings.ts` | CREATE | Port from `meetings.js` with auth |
| `apps/api/src/routes/webhooks.ts` | CREATE | Svix-style verification, fail-closed |
| `apps/api/src/routes/health.ts` | CREATE | `/health` (DB + Redis) and `/ready` |
| `apps/api/src/services/recall.ts` | CREATE | Port from `recallService.js` |
| `apps/api/src/services/transcription.ts` | CREATE | Recall transcription (remove AssemblyAI) |
| `apps/api/src/services/analysis.ts` | CREATE | Claude with structured output, chunk-merge |
| `apps/api/src/services/email.ts` | CREATE | Templated, auto-escaped emails |
| `apps/api/src/middleware/errors.ts` | CREATE | Standard error response format |
| `apps/api/src/lib/db.ts` | CREATE | pg pool with tenant context |
| `apps/api/src/lib/redis.ts` | CREATE | Redis/Valkey connection |
| `apps/api/src/lib/logger.ts` | CREATE | Structured JSON, no sensitive data |
| `apps/worker/src/index.ts` | CREATE | BullMQ worker entry |
| `apps/worker/src/jobs/process-meeting.ts` | CREATE | Port from `worker.js` |
| `apps/worker/src/jobs/reconciler.ts` | CREATE | 10-min stuck meeting check |
| `packages/shared/src/recall.ts` | CREATE | `RECALL_EVENT_TO_STATUS` mapping |
| `packages/shared/src/analysis.ts` | CREATE | Zod schemas for Claude output |
| `db/migrations/001_initial.sql` | CREATE | Base schema with `webhook_events` |

#### UI Files

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/main.tsx` | CREATE | Vite entry |
| `apps/web/src/App.tsx` | CREATE | Router setup |
| `apps/web/src/routes/meetings.tsx` | CREATE | Port meetings grid |
| `apps/web/src/routes/meeting-detail.tsx` | CREATE | Port detail page |
| `apps/web/src/components/SendBotModal.tsx` | CREATE | Port JoinMeetingModal |
| `apps/web/src/components/MeetingCard.tsx` | CREATE | Port from frontend |
| `apps/web/src/lib/api.ts` | CREATE | API client |

#### Cleanup

| File | Action |
|------|--------|
| `server.js` | DELETE (after port) |
| `meetings.js` | DELETE (after port) |
| `webhooks.js` | DELETE (after port) |
| `recallService.js` | DELETE (after port) |
| `transcriptionService.js` | DELETE (after port) |
| `analysisService.js` | DELETE (after port) |
| `emailService.js` | DELETE (after port) |
| `worker.js` | DELETE (after port) |
| `db.js` | DELETE (after port) |
| `logger.js` | DELETE (after port) |
| `MeetingAssistant.jsx` | DELETE (orphan) |
| `.replit`, `replit.nix` | DELETE |
| `frontend/.replit` | DELETE |
| `frontend/replit.nix` | DELETE |

---

### Phase 2: Auth and Tenants

**Goal:** OIDC sign-in, multi-tenancy with RLS, seat management.

#### Backend Files

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/auth.ts` | CREATE | OIDC login/logout/callback |
| `apps/api/src/middleware/auth.ts` | CREATE | Session validation, role check |
| `apps/api/src/middleware/tenant.ts` | CREATE | Set `app.tenant_id` per request |
| `apps/api/src/routes/tenant.ts` | CREATE | `/tenant/seats` CRUD |
| `db/migrations/002_tenants.sql` | CREATE | `tenants`, `memberships` tables |
| `db/migrations/003_add_tenant_id.sql` | CREATE | Add `tenant_id` to all tables |
| `db/migrations/004_rls.sql` | CREATE | RLS policies for all tables |
| `packages/shared/src/api.ts` | UPDATE | Add auth types |

#### UI Files

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/routes/login.tsx` | CREATE | OIDC login page |
| `apps/web/src/routes/settings/seats.tsx` | CREATE | Seats grid |
| `apps/web/src/components/InviteModal.tsx` | CREATE | Invite member modal |
| `apps/web/src/hooks/useAuth.ts` | CREATE | Auth context |
| `apps/web/src/lib/auth.ts` | CREATE | Session management |

---

### Phase 3: White-Label and Consent

**Goal:** Tenant branding, consent flow implementation.

#### Backend Files

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/tenant.ts` | UPDATE | Add branding endpoints |
| `apps/api/src/services/recall.ts` | UPDATE | Bot name from tenant branding |
| `apps/api/src/services/consent.ts` | CREATE | Pre-join notice, in-call chat |
| `apps/worker/src/jobs/process-meeting.ts` | UPDATE | Check consent status before processing |
| `db/migrations/005_branding.sql` | CREATE | `tenant_branding` table |
| `db/migrations/006_settings.sql` | CREATE | `tenant_settings` table |
| `db/migrations/007_templates.sql` | CREATE | `templates` table |

#### UI Files

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/routes/settings/branding.tsx` | CREATE | Branding editor |
| `apps/web/src/routes/settings/consent.tsx` | CREATE | Consent settings |
| `apps/web/src/components/BrandingPreview.tsx` | CREATE | Live preview |
| `apps/web/src/hooks/useTenantBranding.ts` | CREATE | Load branding on mount |
| `apps/web/src/styles/theme.ts` | UPDATE | CSS variables from branding |

#### Content Cleanup

| File | Action |
|------|--------|
| `frontend/lib/mock-data.ts` | SCRUB "KarEve" string |
| `frontend/app/(dashboard)/settings/page.tsx` | SCRUB hardcoded owner |
| `frontend/components/dashboard/Sidebar.tsx` | SCRUB hardcoded owner |
| `frontend/app/(marketing)/pricing/page.tsx` | REMOVE price literals |
| `frontend/components/marketing/SocialProof.tsx` | REMOVE fake stats |
| `docs/plans/*.md` | SCRUB KarEve, owner email, prices |

---

### Phase 4: Ops Differentiators

**Goal:** Action item approval queue, external integrations, ops extraction.

#### Backend Files

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/action-items.ts` | CREATE | Action item CRUD |
| `apps/api/src/routes/integrations.ts` | CREATE | OAuth connections |
| `apps/api/src/services/integrations/asana.ts` | CREATE | Asana push/sync |
| `apps/api/src/services/integrations/notion.ts` | CREATE | Notion push/sync |
| `apps/api/src/services/integrations/github.ts` | CREATE | GitHub Issues push/sync |
| `apps/worker/src/jobs/sync-back.ts` | CREATE | 15-min sync job |
| `db/migrations/008_action_items.sql` | CREATE | `action_items` table |
| `db/migrations/009_integrations.sql` | CREATE | `integration_connections` table |
| `packages/shared/src/analysis.ts` | UPDATE | Add ops extraction schema |

#### UI Files

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/routes/actions.tsx` | CREATE | Action items page |
| `apps/web/src/components/ActionItemRow.tsx` | CREATE | With approve/edit |
| `apps/web/src/routes/settings/integrations.tsx` | CREATE | Integration connections |
| `apps/web/src/components/IntegrationCard.tsx` | CREATE | OAuth connect button |

---

### Phase 5: Pilot

**Goal:** Observability, deployment, pilot tenant provisioning.

#### Backend Files

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/sentry.ts` | CREATE | Sentry integration |
| `apps/api/src/lib/metrics.ts` | CREATE | Custom metrics |
| `apps/worker/src/lib/sentry.ts` | CREATE | Sentry integration |
| `db/migrations/010_audit_log.sql` | CREATE | `audit_log` table |

#### Infrastructure Files

| File | Action | Description |
|------|--------|-------------|
| `.do/app.yaml` | CREATE | DO App Platform spec |
| `scripts/provision-tenant.ts` | CREATE | Admin script for pilot |
| `docs/runbook.md` | CREATE | Operations runbook |
| `docs/soc2-checklist.md` | CREATE | SOC 2-lite checklist |

#### UI Files

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/routes/analytics.tsx` | CREATE | Port analytics page |
| `apps/web/src/components/Dashboard.tsx` | UPDATE | Add metrics widgets |

---

## 4. Test Plan

### Unit Tests (Vitest)

| Category | Tests |
|----------|-------|
| Recall event mapping | `RECALL_EVENT_TO_STATUS` covers all events |
| Signature verification | Valid, invalid, rotated multi-sig, stale timestamp |
| URL host allow-list | zoom.us, meet.google.com, teams.microsoft.com; reject others |
| Zod analysis parsing | Valid, invalid, repair attempt |
| Chunk-merge | Long transcripts split and merged correctly |
| Seat math | seats_used <= seat_limit enforced |
| Retention cutoff | Correct date calculation |
| Bot name disclosure | Must contain "Notetaker", "Recorder", or "AI notes" |
| Email escaping | `<script>` in task renders escaped |

### Integration Tests (Vitest + Testcontainers)

| Category | Tests |
|----------|-------|
| Full pipeline | Synthetic Recall/Claude fixtures → completed meeting |
| RLS isolation | Every table: tenant A cannot see tenant B |
| Idempotency | Duplicate webhook returns 200, no side effects |
| Consent denied | `recording_permission_denied` → no transcript stored |
| Media delete failure | Meeting stays `processing`, retry and alert |
| Retention purge | Old meetings deleted, audit log written |

### API Contract Tests

| Category | Tests |
|----------|-------|
| Shared schemas | UI field names exist in API responses |
| Error codes | All error codes have user-facing messages |

### UI Tests (Vitest + Testing Library)

| Category | Tests |
|----------|-------|
| Meetings grid | Empty, loading, success, error states |
| Send bot modal | Disable on submit, show error codes |
| Detail page | Failed banner, consent_denied banner |
| Seats grid | At limit shows warning |
| Branding preview | Updates live |

### Playwright Smoke Tests

| Category | Tests |
|----------|-------|
| Auth flow | Login → dashboard → logout |
| Meeting flow | Send bot → see in grid → open detail |
| Settings | Change branding → see preview |

### Security Tests

| Category | Tests |
|----------|-------|
| gitleaks | No secrets in code |
| npm audit | No high/critical vulnerabilities |
| Log scrub | No transcript text, signed URLs, webhook bodies |

---

## 5. CI Plan

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run test
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm audit --audit-level=high
```

**No deploy job in v1 CI per spec.**

---

## 6. Estimates

| Phase | Scope | Ideal Days | Confidence |
|-------|-------|------------|------------|
| 1: E2E Pipeline | Restructure, webhooks, worker, basic UI | 5-7 | High (80%) |
| 2: Auth + Tenants | OIDC, RLS, seats | 4-5 | Medium (70%) |
| 3: White-Label + Consent | Branding, consent flow, cleanup | 4-5 | Medium (70%) |
| 4: Ops Differentiators | Action items, integrations | 5-7 | Medium (60%) |
| 5: Pilot | Observability, deployment, runbook | 3-4 | High (80%) |

**Total:** 21-28 ideal days

**Confidence Notes:**
- Phase 1 is well-defined; mostly porting existing code
- Phase 2 RLS complexity depends on edge cases found during testing
- Phase 3 consent depends on Recall chat API behavior across platforms
- Phase 4 integrations each have OAuth complexity; OAuth providers vary
- Phase 5 is straightforward if earlier phases are stable

---

## 7. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Recall chat API not available on all platforms | Consent announcement not possible on some platforms | Per spec, require host-side "Remove bot" if chat unavailable |
| OAuth provider (Google/Microsoft) approval delays | Auth blocked | Use existing library with tested flows; have manual test accounts |
| RLS performance on large tenant data | Slow queries | Index on `tenant_id`; query analyze in integration tests |
| Claude rate limits during high volume | Processing delays | Exponential backoff; DLQ; consider batch processing |
| Next.js 16.x critical vulnerabilities | Security | Upgrade to 16.4.6+ or migrate to Vite (Phase 1 plan includes Vite) |
| Recall webhook delivery failures | Missed events | Reconciler job catches stuck meetings; Recall retries for 24h |

---

## 8. Open Questions

**Q1: Transcript retention default**  
What should be the default value for `tenant_settings.transcript_retention_days`? Options: 30, 90, 365, or NULL (keep until deleted). Must tenants be able to change it?
> *Marked as `TODO(Q1)` in code until answered.*

**Q2: Repo visibility**  
When will the repo be made private? When will secret scanning be enabled?
> *Ahmad action. Recommend before any pilot data exists.*

**Q3: Recap email audience**  
Default recipient: seat-holder only, or all invited attendees?
> *Affects `notify_attendees` default and email sending logic.*

**Q4: Product name**  
What is the real product name for Bridge-level brand strings (logo text, H1, CTAs, page title, email footer)?
> *Using `[PRODUCT NAME]` placeholder until answered. Also needed: default bot name format when tenant hasn't set one.*

**Q5: Consent notice review**  
Who will review the consent notice text before the first live tenant, and when?
> *Ahmad action. Not legal advice from Bridge agents.*

**Q6: Per-seat price points**  
What are the per-seat price points? Which billing provider?
> *Ahmad decision. Not in v1 scope; seat_limit is enforced but no billing integration.*

**Q7: Calendar auto-join**  
Is Recall Calendar API integration in scope for Phase 4, or deferred?
> *Spec lists as "Phase 4 stretch, decided in PLAN".*

**Q8: Attendee-speaker mapping**  
Is matching speaker labels to calendar attendees in scope for Phase 4?
> *Spec lists as "Phase 4 stretch, decided in PLAN".*

**Q9: AssemblyAI vs Recall transcription**  
COST.md recommends Recall transcription ($0.75/hr total). Confirm removal of AssemblyAI path?
> *Current codebase uses both; spec says "one provider (PREP decides)".*

**Q10: Multi-language support**  
Current codebase is English-only (`transcriptionService.js:44`). Is multi-language required for v1?
> *Affects transcription provider choice and Claude prompts.*

---

## 9. Dependencies

### External Services

| Service | Purpose | Required Credentials |
|---------|---------|---------------------|
| Recall.ai | Meeting bot, transcription | `RECALL_API_KEY`, `RECALL_WEBHOOK_SECRET` |
| Anthropic | Claude analysis | `ANTHROPIC_API_KEY` |
| SendGrid/SMTP | Email delivery | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
| Google OAuth | OIDC sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Microsoft OAuth | OIDC sign-in | `MS_CLIENT_ID`, `MS_CLIENT_SECRET` |
| Sentry | Error tracking | `SENTRY_DSN` |

### Infrastructure (DigitalOcean)

| Service | Purpose |
|---------|---------|
| App Platform | api, worker, web hosting |
| Managed Postgres | Database |
| Managed Redis/Valkey | Queue, sessions |
| Spaces | Tenant logo storage |

---

## 10. Acceptance Mapping

Per spec §8, each P0 maps to specific tests:

| P0 | Tests |
|----|-------|
| P0-1 | `npm run dev` starts; `/health` returns 200 with DB/Redis ok |
| P0-2 | Integration test: synthetic fixtures → completed meeting; idempotent |
| P0-3 | Unit tests: 401 on unauthenticated; 404 on cross-tenant |
| P0-4 | RLS test suite for every table |
| P0-5 | Unit tests: 400 on unsigned/invalid; boot fails without secret |
| P0-6 | Unit tests: bot name validation; integration: consent_denied path |
| P0-7 | grep invariant test: no price literals |
| P0-8 | grep invariant test: no "KarEve" outside .git; no hardcoded owner |
