# PREP Baseline Report: SPEC-MA-PROD-V1

**Date:** 2026-11-10  
**Node Version:** v22.23.4  
**npm Version:** 10.9.9  
**Platform:** linux 6.12.113+

---

## 1. Backend Start Attempt

### Command
```bash
cd /workspace && npm install && node server.js
```

### npm install Output (7s)
```
npm warn deprecated cron-parser@4.9.0: v4 is no longer maintained, upgrade to v5
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
npm warn deprecated uuid@8.3.2: uuid@10 and below is no longer supported.
npm warn deprecated uuid@9.0.1: uuid@10 and below is no longer supported.

added 213 packages, and audited 214 packages in 7s

33 packages are looking for funding
  run `npm fund` for details

5 vulnerabilities (4 moderate, 1 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force
```

### node server.js Output (FAILED as expected)
```
node:internal/modules/cjs/loader:1433
  throw err;
  ^

Error: Cannot find module './utils/logger'
Require stack:
- /workspace/server.js
    at Function._resolveFilename (node:internal/modules/cjs/loader:1430:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1040:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1045:22)
    at Function._load (node:internal/modules/cjs/loader:1216:25)
    at wrapModuleLoad (node:internal/modules/cjs/loader:254:19)
    at Module.require (node:internal/modules/cjs/loader:1527:12)
    at require (node:internal/modules/helpers:147:16)
    at Object.<anonymous> (/workspace/server.js:10:16)
    at Module._compile (node:internal/modules/cjs/loader:1781:14)
    at Object..js (node:internal/modules/cjs/loader:1913:10) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [ '/workspace/server.js' ]
}

Node.js v22.23.4
```

**Result:** FAILED as expected. The `server.js` file references `./utils/logger` but the directory structure is flat (no `src/` or `utils/` directories).

**Root Cause:** Path mismatch between `package.json` scripts (expecting `src/`) and actual file locations (flat at root).

---

## 2. Frontend npm ci

### Command
```bash
cd /workspace/frontend && npm ci
```

### Output (35s)
```
added 411 packages, and audited 412 packages in 34s

149 packages are looking for funding
  run `npm fund` for details

22 vulnerabilities (1 low, 10 moderate, 10 high, 1 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force
```

**Result:** SUCCESS (with vulnerabilities)

---

## 3. Frontend Build

### Command
```bash
cd /workspace/frontend && npm run build
```

### Output (9s)
```
> frontend@0.1.0 build
> next build

⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
 We detected multiple lockfiles and selected the directory of /workspace/package-lock.json as the root directory.
 To silence this warning, set `turbopack.root` in your Next.js config, or consider removing one of the lockfiles if it's not needed.
 Detected additional lockfiles: 
   * /workspace/frontend/package-lock.json

Attention: Next.js now collects completely anonymous telemetry regarding usage.
This information is used to shape Next.js' roadmap and prioritize features.
You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
https://nextjs.org/telemetry

▲ Next.js 16.1.6 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 5.3s
  Running TypeScript ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/12) ...
  Generating static pages using 3 workers (3/12) 
  Generating static pages using 3 workers (6/12) 
  Generating static pages using 3 workers (9/12) 
✓ Generating static pages using 3 workers (12/12) in 228.6ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /actions
├ ○ /analytics
├ ○ /forgot-password
├ ○ /login
├ ○ /meetings
├ ƒ /meetings/[id]
├ ○ /pricing
├ ○ /settings
└ ○ /signup


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

**Result:** SUCCESS

**Build Time:** 5.3s compile + 228.6ms static generation  
**Total:** ~9s

---

## 4. Frontend Lint

### Command
```bash
cd /workspace/frontend && npm run lint
```

### Output (3s)
```
> frontend@0.1.0 lint
> eslint


/workspace/frontend/components/dashboard/JoinMeetingModal.tsx
  19:36  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/workspace/frontend/components/dashboard/JoinMeetingModal.tsx:19:36
  17 |   const platform = detectPlatform(url);
  18 |
> 19 |   useEffect(() => { if (!isOpen) { setUrl(""); setTitle(""); setLoading(false); } }, [isOpen]);
     |                                    ^^^^^^ Avoid calling setState() directly within an effect
  20 |
  21 |   if (!isOpen) return null;
  22 |  react-hooks/set-state-in-effect

✖ 1 problem (1 error, 0 warnings)
```

**Result:** FAILED (1 error)

**Issue:** `JoinMeetingModal.tsx:19` — setState within useEffect  
**Fix:** Refactor to use controlled component pattern or move state reset outside effect

---

## 5. Summary Table

| Step | Command | Duration | Result |
|------|---------|----------|--------|
| Backend npm install | `npm install` | 7s | SUCCESS (5 vulns) |
| Backend start | `node server.js` | <1s | FAILED (MODULE_NOT_FOUND) |
| Frontend npm ci | `npm ci` | 35s | SUCCESS (22 vulns) |
| Frontend build | `npm run build` | 9s | SUCCESS |
| Frontend lint | `npm run lint` | 3s | FAILED (1 error) |

---

## 6. Environment Details

```
Node.js: v22.23.4
npm: 10.9.9
OS: linux 6.12.113+
Next.js: 16.1.6 (Turbopack)
TypeScript: ^5 (from package.json)
React: 19.2.3
```

---

## 7. Files Examined

Per spec §4 context list:

1. `README.md` — Architecture overview; paths (`src/`, `config/`) do not exist
2. `package.json` — Scripts point to non-existent `src/` directory
3. `server.js` — Express bootstrap; requires `./utils/logger` (non-existent)
4. `meetings.js` — Routes; requires `../utils/db`, `../utils/logger` (non-existent)
5. `webhooks.js` — Recall webhook handler; wrong signature scheme, fails open
6. `recallService.js` — Bot creation; references non-existent realtime route
7. `worker.js` — Bull pipeline; ON CONFLICT without unique constraint
8. `transcriptionService.js` — AssemblyAI with add-ons, English only
9. `analysisService.js` — Claude `claude-sonnet-4-6`, regex JSON parse, 60k-char middle-drop
10. `emailService.js` — Unescaped HTML, hardcoded "[PRODUCT NAME]" branding
11. `db.js`, `logger.js` — pg pool (flat), winston file logs
12. `schema.sql` — No tenancy, no RLS
13. `frontend/lib/mock-data.ts` — Contains [BRAND] string
14. `frontend/app/(dashboard)/settings/page.tsx` — Hardcoded owner name/email
15. `frontend/components/dashboard/Sidebar.tsx` — Hardcoded owner name
16. `frontend/components/marketing/SocialProof.tsx` — Fake logos/stats
17. `frontend/app/(marketing)/pricing/page.tsx` — Hardcoded prices
18. `frontend/components/ui/Logo.tsx` — Static branding
19. `MeetingAssistant.jsx` — Orphan prototype; contains [BRAND] string
20. `docs/plans/*.md` — Design docs; contain [BRAND], owner email, prices
