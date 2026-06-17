# Productivity Automation

Personal automation workflows for Gmail, GitHub, and Calendar using n8n.

## Features

- **Gmail Triage** — Auto-categorize emails, label bills, archive noise
- **Bill Tracker** — Auto-log bills to Google Sheets with due dates
- **Daily Digest** — Telegram summary of important emails at 9am
- **GitHub PR Reporter** — Weekly summary of PR activity
- **Calendar Sync** — Block time for bill payments

## Setup

### Prerequisites

- n8n (self-hosted or cloud)
- Google Cloud project with Gmail, Sheets, Calendar APIs enabled
- Telegram bot token

### Installation

```bash
# Clone the repo
git clone git@github.com:kapilthakare/productivity-automation.git
cd productivity-automation

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env

# Start n8n (if self-hosting)
docker-compose up -d
```

### Import Workflows

1. Open n8n UI
2. Go to Workflows → Import
3. Import files from `src/workflows/`

## Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `gmail-triage.json` | Cron (hourly) | Auto-categorize and label emails |
| `bill-tracker.json` | Email trigger | Log bills to Google Sheets |
| `daily-digest.json` | Cron (9am) | Send Telegram summary |
| `github-reporter.json` | Cron (weekly) | Summarize PR activity |

## Environment Variables

See `.env.example` for required variables.

## License

MIT
