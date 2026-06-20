# n8n Productivity Automation - Setup Guide

## Overview
This guide walks you through setting up automated email triage, bill tracking, and daily digests using n8n.

---

## Step 1: Initial n8n Setup (Already Done)
- [x] n8n installed and running at http://localhost:5678/
- [x] Access the web UI in your browser

---

## Step 2: Create Admin Account
1. Open http://localhost:5678/
2. Fill in the setup form:
   - Email: kapilsthakare@gmail.com
   - Password: (choose a secure password)
   - First Name: Kapil
   - Last Name: Thakare
3. Click "Next" → "Get Started"

---

## Step 3: Import Workflows

### 3.1 Import Gmail Triage Workflow
1. Click "Workflows" in the left sidebar
2. Click "Add Workflow" → "Import from File"
3. Select: `src/workflows/gmail-triage.json`
4. Click "Import"

### 3.2 Import Bill Tracker Workflow
1. Click "Add Workflow" → "Import from File"
2. Select: `src/workflows/bill-tracker.json`
3. Click "Import"

### 3.3 Import Daily Digest Workflow
1. Click "Add Workflow" → "Import from File"
2. Select: `src/workflows/daily-digest.json`
4. Click "Import"

---

## Step 4: Configure Gmail OAuth2 Credential

### 4.1 Create Google Cloud Project (if not done)
1. Go to https://console.cloud.google.com/
2. Create new project: "n8n-automation"
3. Enable APIs:
   - Gmail API
   - Google Sheets API
   - Google Calendar API

### 4.2 Create OAuth2 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: "n8n Gmail"
5. Authorized redirect URIs: Add `http://localhost:5678/rest/oauth2-credential/callback`
6. Copy Client ID and Client Secret

### 4.3 Add Credential to n8n
1. In n8n, go to "Credentials" (left sidebar)
2. Click "Add Credential"
3. Search for "Gmail OAuth2"
4. Paste Client ID and Client Secret
5. Click "Sign in with Google"
6. Select your Google account
7. Grant permissions
8. Click "Save"

---

## Step 5: Configure Google Sheets OAuth2 Credential

### 5.1 Create Google Sheet
1. Go to https://sheets.google.com/
2. Create new spreadsheet: "Bill Tracker"
3. Add headers in Row 1:
   - A1: Date
   - B1: Biller
   - C1: Subject
   - D1: Amount
   - E1: Due Date
   - F1: Status
4. Copy the Spreadsheet ID from URL:
   - URL: https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   - Copy the long string after `/d/`

### 5.2 Add Credential to n8n
1. In n8n, go to "Credentials"
2. Click "Add Credential"
3. Search for "Google Sheets OAuth2"
4. Paste Client ID and Client Secret (same as Gmail)
5. Click "Sign in with Google"
6. Select your Google account
7. Grant permissions
8. Click "Save"

---

## Step 6: Configure Telegram Bot Token

### 6.1 Create Telegram Bot
1. Open Telegram and search for @BotFather
2. Send: `/newbot`
3. Name: "Email Digest Bot"
4. Username: (choose available username)
5. Copy the Bot Token

### 6.2 Get Your Chat ID
1. Search for @userinfobot on Telegram
2. Send any message
3. Copy your Chat ID

### 6.3 Add Credential to n8n
1. In n8n, go to "Credentials"
2. Click "Add Credential"
3. Search for "Telegram API"
4. Paste Bot Token
5. Click "Save"

---

## Step 7: Activate Workflows

### 7.1 Activate Gmail Triage
1. Open "Gmail Triage Automation" workflow
2. Click the toggle switch to activate (top right)
3. Workflow runs every hour automatically

### 7.2 Activate Bill Tracker
1. Open "Bill Tracker to Google Sheets" workflow
2. Click the toggle switch to activate
3. Triggers when bill email arrives

### 7.3 Activate Daily Digest
1. Open "Daily Email Digest to Telegram" workflow
2. Click the toggle switch to activate
3. Sends digest at 9am daily

---

## Step 8: Test Workflows

### 8.1 Test Gmail Triage
1. Open "Gmail Triage Automation" workflow
2. Click "Execute Workflow" button
3. Check execution results
4. Verify emails are labeled correctly

### 8.2 Test Bill Tracker
1. Send yourself a test email with "bill" in subject
2. Wait for workflow to trigger
3. Check Google Sheet for new entry

### 8.3 Test Daily Digest
1. Open "Daily Email Digest to Telegram" workflow
2. Click "Execute Workflow"
3. Check Telegram for message

---

## Step 9: Environment Variables (Optional)

For advanced configuration, create `.env` file:

```env
# Google API
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Gmail
GMAIL_ADDRESS=kapilsthakare@gmail.com

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# Google Sheets
GOOGLE_SHEET_ID=your-sheet-id
```

---

## Troubleshooting

### n8n won't start
```bash
# Check logs
tail -f /tmp/n8n.log

# Restart
pkill -f "n8n start"
cd /Users/kapilthakare/Projects/productivity-automation
./node_modules/.bin/n8n start
```

### Gmail authentication fails
- Verify redirect URI is correct
- Check OAuth consent screen is configured
- Ensure Gmail API is enabled

### Telegram not sending
- Verify bot token is correct
- Check chat ID is correct
- Send /start to your bot first

---

## Workflow Files Location
```
/Users/kapilthakare/Projects/productivity-automation/
├── src/workflows/
│   ├── gmail-triage.json
│   ├── bill-tracker.json
│   └── daily-digest.json
├── .env.example
└── README.md
```

---

## Support
- n8n Docs: https://docs.n8n.io/
- GitHub: https://github.com/kapilthakare-cyberpunk/productivity-automation
