# [EPIC] Phase 2 — DMA Insight Hub + Task Management + Carbon Accounting

**Type:** Epic  
**Priority:** High  
**Labels:** `epic`, `phase-2`, `enhancement`  
**Milestone:** Phase 2 Launch

---

## Overview

Phase 2 เพิ่ม 4 core features เพื่อทำให้ AeternumAlly "complete" สำหรับ SME:

1. **DMA Insight Hub** — AI วิเคราะห์คุณภาพ + แนะนำ actions
2. **Task Generator/Manager** — แปลง compliance → actionable tasks
3. **Carbon Accounting** — Wizard + recurring entry dashboard
4. **Evidence Vault** — Link-based free, upload Pro tier

---

## Goals

- ✅ User ได้ quality feedback + recommended actions หลัง DMA
- ✅ User สร้าง tasks จาก DMA/KPI ได้ (ESRS traceability)
- ✅ User เก็บ carbon data recurring ได้ง่าย (<1 min/entry)
- ✅ User แนบ evidence ได้ทุก section

---

## Workflow ใหม่

```
Company Profile
→ Sustainable BMC
→ SWOT Analysis          ← moved before DMA
→ DMA (AI-guided scoring) ← enhanced
→ DMA Insight Hub         ← NEW
→ KPI Dashboard
→ Task Generator/Manager  ← NEW
→ Carbon Accounting       ← NEW (if E1 material)
→ Evidence Vault          ← NEW (ambient)
→ Sustainability Statement
```

---

## Dependencies

### Must complete before Phase 2:
- [ ] Migration: BMC/SWOT → jsonb arrays
- [ ] AI prompts: structured output
- [ ] New DB tables

### Child Issues by Priority:

**P0 — Foundation (must do first):**
- #1 — Migration: BMC/SWOT to jsonb
- #2 — AI Structured Output
- #3 — New DB Tables Schema

**P1 — DMA Enhancements:**
- #4 — AI-Guided Scoring
- #5 — Insight Hub Backend
- #6 — Insight Hub UI

**P1 — Task Management:**
- #7 — Task Generator Backend
- #8 — Task Manager UI
- #9 — Suggested Tasks System
- #10 — Excel Import/Export

**P2 — Carbon Accounting:**
- #11 — Wizard UI (Gamified)
- #12 — Dashboard (Recurring)
- #13 — Emission Factors DB

**P2 — Evidence Vault:**
- #14 — Schema + API
- #15 — Google Drive OAuth
- #16 — Link UI (Ambient)

**P3 — Premium Features:**
- #17 — Evidence Upload (Pro)
- #18 — AI Quota System

---

## Success Metrics

- Conversion Free → Pro: 18% target
- Time to complete DMA: -30% vs v1
- Task completion rate: >60%
- Carbon data entry: monthly for 80% orgs

---

## Timeline Estimate

- **Sprint 1 (2 weeks):** Foundation (#1-#3)
- **Sprint 2 (2 weeks):** DMA (#4-#6)
- **Sprint 3 (2 weeks):** Tasks (#7-#10)
- **Sprint 4 (2 weeks):** Carbon (#11-#13)
- **Sprint 5 (2 weeks):** Evidence + Premium (#14-#18)

**Total:** ~10 weeks
