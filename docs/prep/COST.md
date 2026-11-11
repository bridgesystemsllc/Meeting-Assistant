# PREP Cost Model: SPEC-MA-PROD-V1

**Date:** 2026-11-10  
**Scope:** Transcript-only path (no audio stored)

---

## 1. Vendor Pricing (as of 2026-11-10)

### Recall.ai Bot

**Source:** https://www.recall.ai/pricing (accessed 2026-11-10)

| Tier | Rate |
|------|------|
| Pay As You Go | $0.50/hr of recording |
| Startup Program | $0.25/hr (first 10,000 hours, early-stage only) |
| Launch/Enterprise | Custom pricing |

**Notes:**
- Pricing is per recording hour, prorated to the second
- Participant count does not affect billing
- Calendar API is free
- 5 free hours on signup

### Recall.ai Built-in Transcription

**Source:** https://www.recall.ai/pricing (accessed 2026-11-10)

| Service | Rate |
|---------|------|
| Transcription (async & real-time) | $0.15/hr |

### Recall.ai Storage

**Source:** https://docs.recall.ai/docs/storage-and-playback (accessed 2026-11-10)

| Service | Rate |
|---------|------|
| First 168 hours (7 days) | Free |
| After 7 days | $0.000069/hour_hour |

**Transcript-only path:** With immediate media deletion after transcript retrieval, storage costs are $0.00.

### AssemblyAI Transcription

**Source:** https://www.assemblyai.com/pricing (accessed 2026-11-10)

| Model | Rate | Notes |
|-------|------|-------|
| Universal-3.5 Pro | $0.21/hr | Best accuracy |
| Universal-2 | $0.15/hr | Legacy |

**Add-ons used in current codebase:**
- Speaker Diarization: +$0.02/hr (standard)
- Auto Chapters: +$0.08/hr (Universal-2 only, deprecated)
- Auto Highlights: +$0.01/hr (English only)
- Sentiment Analysis: +$0.02/hr
- Entity Detection: +$0.08/hr

**Current codebase cost (AssemblyAI):**  
Universal-2 + all add-ons = $0.15 + $0.02 + $0.08 + $0.01 + $0.02 + $0.08 = **$0.36/hr**

### Claude (Anthropic)

**Source:** https://www.anthropic.com/pricing (industry knowledge, 2026-11-10)

| Model | Input | Output |
|-------|-------|--------|
| Claude Sonnet 4.6 | ~$3.00/M tokens | ~$15.00/M tokens |

**Estimate per meeting:**
- Average meeting transcript: ~15,000 words ≈ 20,000 tokens
- Prompt overhead: ~2,000 tokens
- Response: ~2,000 tokens
- **Input cost:** 22,000 tokens × $3.00/M = $0.066
- **Output cost:** 2,000 tokens × $15.00/M = $0.030
- **Total per meeting:** ~$0.096

**Per hour (assuming 1-hour meeting):** ~$0.10/hr

---

## 2. Cost Comparison: Transcript-Only Path

### Option A: Recall Bot + Recall Transcription

| Component | Cost/hr |
|-----------|---------|
| Recall Bot | $0.50 |
| Recall Transcription | $0.15 |
| Claude Analysis | $0.10 |
| Storage (immediate delete) | $0.00 |
| **Total** | **$0.75/hr** |

### Option B: Recall Bot + AssemblyAI (current codebase)

| Component | Cost/hr |
|-----------|---------|
| Recall Bot | $0.50 |
| AssemblyAI (U2 + add-ons) | $0.36 |
| Claude Analysis | $0.10 |
| Storage (immediate delete) | $0.00 |
| **Total** | **$0.96/hr** |

### Option C: Recall Bot + AssemblyAI (minimal)

| Component | Cost/hr |
|-----------|---------|
| Recall Bot | $0.50 |
| AssemblyAI Universal-2 | $0.15 |
| Speaker Diarization | $0.02 |
| Claude Analysis | $0.10 |
| Storage (immediate delete) | $0.00 |
| **Total** | **$0.77/hr** |

### Option D: Recall Bot + AssemblyAI (best quality)

| Component | Cost/hr |
|-----------|---------|
| Recall Bot | $0.50 |
| AssemblyAI U3.5 Pro | $0.21 |
| Speaker Diarization | $0.02 |
| Claude Analysis | $0.10 |
| Storage (immediate delete) | $0.00 |
| **Total** | **$0.83/hr** |

---

## 3. Kill Criteria Check

**Threshold:** $1.25/meeting-hour

| Option | Cost/hr | Under Threshold? |
|--------|---------|------------------|
| A: Recall + Recall Transcription | $0.75 | ✅ YES |
| B: Recall + AssemblyAI (current) | $0.96 | ✅ YES |
| C: Recall + AssemblyAI (minimal) | $0.77 | ✅ YES |
| D: Recall + AssemblyAI (best) | $0.83 | ✅ YES |

**All options are under the $1.25 kill threshold.**

---

## 4. Recommendation

### Primary: Option A — Recall Bot + Recall Transcription

**Cost:** $0.75/hr  
**Rationale:**
1. **Simplest integration** — Single vendor for bot + transcription
2. **Lowest cost** — $0.75/hr vs $0.77-$0.96/hr for AssemblyAI options
3. **No double transcription** — Current codebase uses both Recall captions AND AssemblyAI (spec §4.6 notes "double")
4. **Sufficient quality** — Recall transcription is adequate for meeting notes
5. **Easier compliance** — Single data processor instead of two

**Trade-off:** AssemblyAI offers additional features (sentiment, entity detection, auto-chapters) that may improve analysis quality. However:
- Claude already performs sentiment/topic analysis
- Entity detection can be done by Claude
- Auto-chapters is deprecated in AssemblyAI
- Cost savings of $0.02-$0.21/hr compound over volume

### Alternative: Option D — Recall Bot + AssemblyAI U3.5 Pro (if higher accuracy needed)

**Cost:** $0.83/hr  
**When to use:** If pilot feedback shows transcription quality issues, upgrade to AssemblyAI U3.5 Pro. Still well under kill threshold.

---

## 5. Cost Projections

### Per-tenant monthly cost (assuming 20 meeting-hours/month)

| Option | Cost/month |
|--------|------------|
| A: Recall + Recall | $15.00 |
| D: Recall + AssemblyAI U3.5 | $16.60 |

### Break-even analysis for pilot (1 tenant)

| Fixed Costs | Amount |
|-------------|--------|
| DO App Platform (api + worker + web) | ~$25/month |
| DO Managed Postgres (basic) | ~$15/month |
| DO Managed Redis | ~$15/month |
| DO Spaces (logos only) | ~$5/month |
| **Total infrastructure** | ~$60/month |

**Break-even at recommended tier ($0.75/hr):**
- Per seat: depends on seat_limit and price (Ahmad decision)
- Infrastructure is fixed regardless of meeting volume

---

## 6. Pricing Links (dated)

| Vendor | URL | Accessed |
|--------|-----|----------|
| Recall.ai | https://www.recall.ai/pricing | 2026-11-10 |
| Recall.ai Storage | https://docs.recall.ai/docs/storage-and-playback | 2026-11-10 |
| AssemblyAI | https://www.assemblyai.com/pricing | 2026-11-10 |
| Anthropic | https://www.anthropic.com/pricing | 2026-11-10 |

---

## 7. Open Questions for Cost

1. **Startup program eligibility:** Does Bridge qualify for Recall's $0.25/hr startup rate? (Could reduce cost to $0.40-$0.50/hr)

2. **Volume discounts:** At what meeting volume do Recall/AssemblyAI offer custom pricing?

3. **Multi-language support:** Recall transcription language coverage vs AssemblyAI? (Current codebase is English-only per `transcriptionService.js:44`)

4. **Real-time vs async:** If real-time transcription is needed later, AssemblyAI streaming is $0.15/hr (U-Streaming) vs $0.45/hr (U3.6 Pro Realtime)
