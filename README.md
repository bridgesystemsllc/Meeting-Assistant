# 🤖 Meeting Assistant
**AI-powered meeting notes, action items, and analysis — like Read AI, built by you.**

---

## Architecture Overview

```
Meeting starts
    → You trigger: POST /api/v1/meetings with meeting URL
    → Recall.ai bot joins the meeting as a participant
    → Bot records audio throughout the meeting
    → Meeting ends → Recall.ai sends webhook to your backend
    → Your backend queues the recording for processing
    → Recall.ai transcribes with speaker diarization (recallai_streaming)
    → Claude analyzes the transcript (summary, actions, decisions, risks)
    → Results stored in PostgreSQL
    → Email sent to meeting owner with full notes
    → Dashboard shows all meeting history
```

---

## Tech Stack

| Layer | Service | Purpose |
|---|---|---|
| Meeting Bot | [Recall.ai](https://recall.ai) | Joins Zoom/Meet/Teams, records + transcribes |
| AI Analysis | [Claude API](https://anthropic.com) | Notes, actions, decisions, sentiment |
| Queue | Redis + Bull | Background job processing |
| Database | PostgreSQL | Store meetings, transcripts, analysis |
| Email | SendGrid/SMTP | Deliver notes to attendees |
| Backend | Node.js + Express | API + webhook handling |
| Frontend | React + Tailwind | Dashboard |

---

## Quick Start

### 1. Clone & Install
```bash
git clone <your-repo>
cd meeting-assistant
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Fill in your API keys (see below)
```

### 3. Set Up Database
```bash
psql -U postgres -c "CREATE DATABASE meeting_assistant"
psql -U postgres -d meeting_assistant -f config/schema.sql
```

### 4. Start Redis
```bash
redis-server
# Or: docker run -d -p 6379:6379 redis
```

### 5. Start the Services
```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Background Worker
npm run worker
```

### 6. Expose Webhook URL (for development)
```bash
# Install ngrok: https://ngrok.com
ngrok http 3001
# Copy the HTTPS URL → set as RECALL_WEBHOOK_URL in Recall dashboard
```

---

## API Keys You Need

### Recall.ai (Meeting Bot)
1. Sign up at [recall.ai](https://www.recall.ai)
2. Get API key from dashboard
3. Set webhook URL: `https://your-domain.com/webhooks/recall`
4. Copy webhook secret

**Cost:** ~$0.50-$1.00 per meeting hour

### Anthropic / Claude (AI Analysis)
1. Get API key from [console.anthropic.com](https://console.anthropic.com)
2. Uses claude-opus-4 for analysis

**Cost:** ~$0.05-$0.15 per meeting analysis

### Total Cost Per Meeting
~$1-2 per hour of meeting time

---

## API Endpoints

### Send Bot to Meeting
```bash
POST /api/meetings/join
{
  "meetingUrl": "https://zoom.us/j/123456",
  "title": "Q2 Planning",
  "userId": "user-uuid"
}
```

### Get Meeting Details
```bash
GET /api/meetings/:id
# Returns: meeting + transcript + full analysis
```

### List Meetings
```bash
GET /api/meetings?userId=xxx&limit=20&offset=0
```

### Remove Bot
```bash
DELETE /api/meetings/:id/bot
```

---

## File Structure

```
meeting-assistant/
├── apps/
│   ├── api/                   # Express API server
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── meetings.ts    # Meeting CRUD + bot dispatch
│   │       │   └── webhooks.ts    # Recall.ai webhook handler
│   │       └── services/
│   │           ├── recall.ts      # Recall.ai bot management
│   │           └── webhook-verify.ts # Svix signature verification
│   ├── web/                   # React + Vite frontend
│   └── worker/                # BullMQ background job processing
│       └── src/
│           ├── jobs/
│           │   └── process-meeting.ts  # Full pipeline
│           └── services/
│               ├── analysis.ts    # Claude AI analysis
│               └── email.ts       # Email notifications
├── packages/
│   └── shared/                # Shared types and schemas
├── db/
│   └── migrations/            # PostgreSQL migrations
├── .env.example               # Environment template
└── package.json               # Workspace root
```

---

## What Claude Extracts From Each Meeting

```json
{
  "summary": "3-5 sentence executive summary",
  "key_decisions": [
    { "decision": "...", "owner": "...", "context": "..." }
  ],
  "action_items": [
    { "task": "...", "owner": "...", "due_date": "...", "priority": "high|medium|low" }
  ],
  "topics_discussed": [
    { "topic": "...", "sentiment": "positive|negative|neutral", "time_spent_pct": 30 }
  ],
  "questions_unresolved": [...],
  "risks_and_blockers": [...],
  "meeting_metrics": {
    "overall_sentiment": "positive",
    "engagement_score": 82,
    "meeting_effectiveness": "high"
  },
  "next_meeting_suggestions": {
    "recommended_agenda": [...],
    "suggested_duration_minutes": 30
  },
  "follow_up_email_draft": "..."
}
```

---

## Roadmap / Next Features

- [ ] Calendar integration (Google Calendar / Outlook) - auto-join scheduled meetings
- [ ] Slack integration - post notes to channels automatically  
- [ ] CRM sync (HubSpot/Salesforce) - log call notes to deals
- [ ] Speaker name mapping - match speaker labels to calendar attendees
- [ ] Real-time notes - stream notes during the meeting (not just after)
- [ ] Search across all meetings
- [ ] Team workspace - share meetings with teammates
- [ ] Custom note templates by meeting type (sales call, 1:1, standup)

---

## Production Deployment

```bash
# Using Docker Compose
docker-compose up -d

# Or deploy to Railway/Render/Fly.io
railway up
```

**Minimum Requirements:**
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- 512MB RAM (1GB recommended)
