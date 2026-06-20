# Magento 2 Admin Order Automation

**Date:** 2026-06-19
**Status:** Design Approved

## Overview

Automate placing back-end (admin) orders in Magento 2 via the GUI (Playwright) when the user says "place order in Magento" or "make a back-end booking". The user provides order data through clipboard paste, customer message, screenshot, or plain text — the script handles the rest.

## Architecture

```
User trigger (Telegram/terminal/voice)
       │
       ▼
   n8n Webhook ───► Execute Command node
       │                    │
       │              ┌─────┘
       ▼              ▼
  magento-place-order.mjs  (Playwright script)
       │
       ├── Launch Chromium (headed)
       ├── Login to admin
       ├── Pause for 2FA code (manual input)
       ├── Navigate to Create New Order
       ├── Select customer
       ├── Add products + configure rental dates (Sales Igniter)
       ├── Set payment & shipping
       ├── Submit order
       ├── Download rental agreement PDF
       └── Print order confirmation
```

## Components

### 1. `scripts/magento-place-order.mjs`

The core automation script using Playwright.

**Input:** JSON via CLI argument `--data` or piped stdin:
```json
{
  "customer": "Mihir Tokekar",
  "customerEmail": "mihir2692@gmail.com",
  "products": [
    {
      "sku": "AIP17PM256",
      "qty": 1,
      "rentalStart": "2026-06-23",
      "rentalEnd": "2026-06-23",
      "customPrice": 1700
    }
  ],
  "paymentMethod": "Pay by Credit",
  "shippingMethod": "Self Pickup",
  "shippingOption": "In-Store Pickup",
  "comment": "Order Placed by Kapil Thakare using Admin Panel"
}
```

**Flow (detailed):**

| Step | Description | Automation |
|------|-------------|------------|
| 1 | Navigate to admin login | Auto |
| 2 | Enter username `kapilt` and password | Auto |
| 3 | Complete reCAPTCHA | Manual (headed, waits for user) |
| 4 | Enter 2FA TOTP code | Manual — terminal prompt |
| 5 | Sales → Orders → Create New Order | Auto |
| 6 | Search & select customer | Auto |
| 7 | Search product by SKU/name | Auto |
| 8 | Configure rental dates (Sales Igniter) | Auto |
| 9 | Add product to order | Auto |
| 10 | Select payment method | Auto |
| 11 | Select shipping method | Auto |
| 12 | Submit order | Auto |
| 13 | Extract order number from confirmation | Auto |
| 14 | Open/download rental agreement PDF | Auto |
| 15 | Print output to stdout/stdin | Auto |

**Dependencies:**
- `playwright` (npm package)
- Node.js built-in `crypto` for TOTP (no extra dep)

**Output:**
```json
{
  "success": true,
  "orderNumber": "000073368",
  "orderId": 98889,
  "total": "₹1,700.00",
  "pdfPath": "/path/to/rental-agreement-000073368.pdf"
}
```

### 2. Login & Session Strategy

- Script runs **headed** (user can watch the browser)
- First-run: user completes reCAPTCHA + enters 2FA code manually
- Session cookies saved to disk; reused if still valid
- If reCAPTCHA appears on subsequent runs → pause and wait for user
- 2FA prompt always shown (since we cannot auto-generate)

### 3. 2FA Handling

- Script pauses at the 2FA page
- Prints to terminal: `⏳ 2FA required — open Google Authenticator and enter the code:`
- Waits for user to type the 6-digit code + Enter
- Submits and continues

### 4. Sales Igniter Rental Integration

- After adding product, the Sales Igniter "Configure" popup opens
- Script detects the rental date fields:
  - Sets `Start Date` and `End Date` from input
  - Fills quantity
  - Confirms the popup

### 5. n8n Workflow: `magento-place-order.json`

A webhook-triggered workflow:

```
Webhook (POST /magento/place-order)
  → Code node (parse input, build JSON payload)
  → Execute Command (run playwright script)
  → Code node (parse output)
  → Respond to Webhook (return order result)
```

**Trigger options:**
- Telegram message: "place order in Magento" → n8n webhook
- Direct curl/webhook call with JSON payload
- Manual trigger from n8n UI with form

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Login fails (wrong credentials) | Print error, exit non-zero |
| reCAPTCHA timeout (>5 min) | Ask user, retry or abort |
| 2FA timeout (>2 min) | Ask user, retry or abort |
| Product not found | Print available options, abort |
| Order submission fails | Screenshot + print error HTML |
| PDF download fails | Continue (order is still placed) |

## Security

- Admin credentials stored in `.env` (already in `.gitignore`)
- TOTP secret (if obtained) stored in `.env`
- No credentials logged or printed
- All data processed locally

## Future Enhancements (out of scope for v1)

- TOTP auto-generation (once secret is obtainable)
- reCAPTCHA bypass via session cookie reuse
- OCR-powered input parsing from screenshots
- Telegram inline bot for order creation
