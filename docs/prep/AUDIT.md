# PREP Audit Report: SPEC-MA-PROD-V1

**Auditor:** FORGE Agent  
**Date:** 2026-11-10  
**Spec Version:** r1.0  
**Repo:** bridgesystemsllc/Meeting-Assistant (main `ff6c3f3`, PUBLIC)

---

## 1. P0 Prerequisite Checks

### P0-1: Backend `npm run dev` starts api and worker

**Status: REFUTED**

The backend fails to start due to incorrect path references. `server.js:10` requires `./utils/logger` but no `src/` directory exists:

```
Error: Cannot find module './utils/logger'
Require stack:
- /workspace/server.js
```

The `package.json` specifies scripts that reference non-existent paths:
- `package.json:7`: `"start": "node src/server.js"` — `src/` does not exist
- `package.json:8`: `"dev": "nodemon src/server.js"` — `src/` does not exist
- `package.json:9`: `"worker": "node src/jobs/worker.js"` — `src/` does not exist

Backend files exist at root level (flat layout), not in `src/`:
- `server.js:10` requires `./utils/logger` (non-existent)
- `meetings.js:10-12` requires from `../utils/` paths (non-existent)
- `webhooks.js:8-9` requires from `../utils/` paths (non-existent)
- `worker.js:11-14` requires from `../utils/` and `../services/` paths (non-existent)

**Conclusion:** Restructure to monorepo layout is required (Phase 1).

---

### P0-2: E2E pipeline with synthetic fixtures

**Status: CANNOT VERIFY (blocked by P0-1)**

No tests exist; pipeline cannot be validated until restructure is complete.

---

### P0-3: Unauthenticated requests get 401

**Status: REFUTED**

No authentication exists. All routes are unprotected:
- `meetings.js:29-71`: `POST /join` accepts `userId` from request body, no validation
- `meetings.js:84-109`: `GET /` accepts `userId` from query parameter, no validation
- `meetings.js:117-166`: `GET /:id` no auth check
- `meetings.js:175-200`: `DELETE /:id/bot` no auth check

---

### P0-4: RLS test suite

**Status: REFUTED**

No RLS exists. The schema has no `tenant_id` columns:
- `schema.sql:1-104`: No multi-tenancy, no RLS policies
- All tables reference `user_id` directly without tenant context

---

### P0-5: Unsigned webhooks get 400; boot fails without secret

**Status: REFUTED**

Current implementation fails open and uses incorrect signature verification:
- `webhooks.js:17-24`: Missing secret logs a warning and continues (`return next()`)
- `webhooks.js:26-28`: Missing signature returns 401 (should be 400)
- `webhooks.js:31-35`: Signature verification uses wrong scheme (plain HMAC-SHA256 on `JSON.stringify(req.body)` instead of Svix-style `${id}.${timestamp}.${rawBody}`)
- No boot-time check for `RECALL_WEBHOOK_SECRET` in production

Per Recall.ai docs (2026-11-10), correct verification requires:
- Headers: `webhook-id`/`svix-id`, `webhook-timestamp`/`svix-timestamp`, `webhook-signature`/`svix-signature`
- Secret format: `whsec_` prefix, base64-encoded
- Signature: HMAC-SHA256 over `${msgId}.${msgTimestamp}.${rawBody}`
- Timestamp tolerance: reject if > 5 minutes old

---

### P0-6: Consent flow

**Status: REFUTED**

No consent mechanisms implemented:
- Bot name hardcoded in `recallService.js:32`: `'Meeting Notes Bot'` (does not disclose recording)
- No pre-join notice system
- No in-call announcement via Recall chat API
- No auto-leave on `recording_permission_denied` (event not handled in `webhooks.js`)
- No store_audio constraint (column doesn't exist)
- No media delete after transcript retrieval

The current `webhooks.js:86-89` STATUS_MAP does not include `recording_permission_denied`:
```js
'joining_call': 'bot_joining',
'in_call_not_recording': 'bot_joining',
'in_call_recording': 'recording',
// missing: recording_permission_denied
```

---

### P0-7: No fake logos/stats/price literals

**Status: REFUTED**

Hardcoded price literals exist in multiple files:
- `frontend/app/(marketing)/pricing/page.tsx:12-40`: `monthlyPrice: 0`, `monthlyPrice: 29`, `monthlyPrice: 600`, etc.
- `frontend/app/(dashboard)/settings/page.tsx:53`: `"$600/mo · Up to 20 users"`
- `docs/plans/2026-03-03-meeting-assistant-frontend-design.md:283`: `$0 for 14 days`, `$29/mo per user`, `$600/mo`
- `docs/plans/2026-03-03-meeting-assistant-frontend-plan.md:1039-1074`: All price values
- `docs/plans/2026-03-03-meeting-assistant-frontend-plan.md:2787`: `$600/mo`

Fake company logos/stats in:
- `frontend/components/marketing/SocialProof.tsx:48-49`: Fake company names ("Acme Corp", "TechFlow", etc.)
- `frontend/components/marketing/SocialProof.tsx:54-57`: Fake stats (10000+, 50000+, 98%)

---

### P0-8: No "KarEve" strings; no hardcoded owner name/email

**Status: REFUTED**

**KarEve strings found:**
- `frontend/lib/mock-data.ts:105`: `title: "KarEve Onboarding Call"`
- `MeetingAssistant.jsx:75`: `title: "KarEve Onboarding Call"`
- `docs/plans/2026-03-03-meeting-assistant-frontend-plan.md:429`: `title: "KarEve Onboarding Call"`

**Hardcoded owner name/email found:**
- `frontend/app/(dashboard)/settings/page.tsx:6-7`: hardcoded owner name/email
- `frontend/components/dashboard/Sidebar.tsx:41`: hardcoded owner name
- `frontend/lib/mock-data.ts:58,93`: "Ahmad" in speaker names
- `MeetingAssistant.jsx:27,62`: "Ahmad" in speaker names
- `docs/plans/2026-03-03-meeting-assistant-frontend-plan.md:382,417,1425,1664,2686-2687`: hardcoded owner name/email

---

## 2. Dependency Audit

### Backend (`npm audit`)

| Severity | Count | Notable Advisories |
|----------|-------|-------------------|
| High | 1 | nodemailer (multiple vulnerabilities including SMTP injection, DoS) |
| Moderate | 4 | minimatch (DoS), uuid (buffer bounds), bull (depends on uuid) |

**Total:** 5 vulnerabilities

**Remediation:**
- nodemailer: upgrade to 10.5.0+ (breaking changes)
- minimatch: `npm audit fix`
- uuid: upgrade to 14.0.3+ or use uuid@11 for CommonJS

### Frontend (`npm audit`)

| Severity | Count | Notable Advisories |
|----------|-------|-------------------|
| Critical | 1 | next@16.1.6 (multiple: HTTP smuggling, CSRF bypass, DoS, XSS, RCE on Windows) |
| High | 10 | brace-expansion (DoS), browserslist (OOM), flatted (DoS/prototype pollution), js-yaml (DoS), nanoid (DoS), picomatch (ReDoS), postcss (XSS/arbitrary file read), sharp (libvips/libheif), source-map-js (DoS), zod (OOM) |
| Moderate | 10 | @babel/core, @humanfs/node, baseline-browser-mapping, brace-expansion, browserslist, minimatch |
| Low | 1 | Various |

**Total:** 22 vulnerabilities

**Remediation:**
- next: upgrade to 16.4.6+ (critical)
- Most others: `npm audit fix`

---

## 3. Dependency License Audit

### Backend (206 packages)

| License | Count |
|---------|-------|
| MIT | 186 |
| ISC | 10 |
| Apache-2.0 | 4 |
| BSD-2-Clause | 2 |
| BSD-3-Clause | 1 |
| BlueOak-1.0.0 | 1 |
| MIT-0 | 1 |
| Custom (recall.ai) | 1 |

**Risk Assessment:** Low. All licenses are permissive.

### Frontend (408 packages)

| License | Count |
|---------|-------|
| MIT | 336 |
| ISC | 27 |
| Apache-2.0 | 22 |
| BSD-2-Clause | 7 |
| MPL-2.0 | 4 |
| BSD-3-Clause | 3 |
| LGPL-3.0-or-later | 2 |
| CC0-1.0 | 1 |
| CC-BY-4.0 | 1 |
| Python-2.0 | 1 |
| 0BSD | 1 |
| BlueOak-1.0.0 | 1 |
| MIT AND ISC | 1 |
| UNLICENSED | 1 |

**Risk Assessment:** Low-Medium. LGPL-3.0-or-later requires attention if bundled (typically fine for npm packages). MPL-2.0 is file-level copyleft.

---

## 4. Secret Scan (Full Git History)

**Tool:** gitleaks v8.18.4  
**Scan Date:** 2026-11-10  
**Scope:** Full git history (2 commits)

### Git History Results

| Rule | Count |
|------|-------|
| (none) | 0 |

**No secrets found in git history.**

### Working Directory Results (non-committed files)

| Rule | Count | Files |
|------|-------|-------|
| generic-api-key | 9 | `frontend/.next/` build artifacts |

**Note:** These are auto-generated Next.js preview mode keys in build output (`frontend/.next/`), not committed to git. The `.next/` directory should be in `.gitignore` (it is).

---

## 5. Recall.ai API Verification

**Documentation Reviewed:** 2026-11-10  
**API Base URL:** `https://us-west-2.recall.ai/api/v1`

### Transcript Retrieval

**Endpoint:** `GET /api/v1/bot/{id}/transcript`  
**Status:** CONFIRMED  
**Docs:** https://docs.recall.ai/reference/bot_transcript_list (accessed 2026-11-10)

### Media Deletion

**Endpoint:** `POST /api/v1/bot/{id}/delete_media/`  
**Status:** CONFIRMED  
**Docs:** https://docs.recall.ai/docs/storage-and-playback (accessed 2026-11-10)

Notes:
- Deletion is irreversible
- Returns 400 if bot is in-progress
- Returns 409 if deletion already in progress
- Rate limit: 300 requests/min/workspace

### Sending In-Call Chat

**Endpoint:** `POST /api/v1/bot/{id}/send_chat_message/`  
**Status:** CONFIRMED  
**Docs:** https://docs.recall.ai/docs/sending-chat-messages (accessed 2026-11-10)

Platform support:
- Zoom: ✅ (everyone, host, everyone_except_host, specific participant DM)
- Google Meet: ✅ (everyone only, supports pinning)
- Teams: ✅ (everyone only, no pinning, requires chat access)

### Reading In-Call Chat

**Status:** CONFIRMED (via webhooks)  
**Docs:** https://docs.recall.ai/docs/chat-messages (accessed 2026-11-10)

Chat messages received via real-time webhooks; not a polling API.

### recording_permission_denied Event

**Status:** CONFIRMED  
**Docs:** https://docs.recall.ai/docs/bot-status-change-events (accessed 2026-11-10)

Event: `bot.recording_permission_denied`  
Schema: `data.data.sub_code` contains the denial reason

---

## 6. Summary

### P0 Status Matrix

| Check | Status | Blocker? |
|-------|--------|----------|
| P0-1 | REFUTED | Yes - restructure required |
| P0-2 | NOT VERIFIED | Blocked by P0-1 |
| P0-3 | REFUTED | Yes - auth required |
| P0-4 | REFUTED | Yes - RLS required |
| P0-5 | REFUTED | Yes - signature fix required |
| P0-6 | REFUTED | Yes - consent required |
| P0-7 | REFUTED | Yes - prices must be removed |
| P0-8 | REFUTED | Yes - KarEve and owner strings must be scrubbed |

### Kill Criteria Check

**Recall transcript-only with no stored audio:** CONFIRMED possible via:
1. Configure `recording_config.retention: null` (Zero Data Retention) for no storage, OR
2. Call `delete_media` endpoint immediately after transcript retrieval

**Cost estimate:** See COST.md. Estimated $0.65-$0.86/meeting-hour (well under $1.25 threshold).

### Recommendations

1. **Security:** Enable GitHub secret scanning and push protection (Ahmad action)
2. **Privacy:** Make repo private before adding any client data (Ahmad action)
3. **Dependencies:** Run `npm audit fix` and upgrade next to 16.4.6+
4. **History:** Consider history rewrite to remove KarEve strings (Ahmad decision, destructive)
