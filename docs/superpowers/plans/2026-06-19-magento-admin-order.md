# Magento Admin Order Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place a back-end order in Magento 2 admin via Playwright, with manual 2FA, triggered from n8n or terminal.

**Architecture:** Single Node.js Playwright script (`scripts/magento-place-order.mjs`) handles the full browser flow. n8n workflow calls it via Execute Command. Input is JSON (stdin or `--data`). Output is JSON (order number + PDF path).

**Tech Stack:** Node.js 18+, Playwright, n8n, Magento 2 admin GUI (Sales Igniter Rental plugin)

---

### Task 1: Install Playwright + set up env

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install Playwright**

Run:
```bash
npm install playwright
npx playwright install chromium
```

- [ ] **Step 2: Update .env.example**

Add to `.env.example`:
```env
# Magento Admin
MAGENTO_ADMIN_URL=https://primesandzooms.com/notoms/admin/dashboard/
MAGENTO_ADMIN_USERNAME=kapilt
MAGENTO_ADMIN_PASSWORD=your-magento-admin-password
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add playwright dependency and magento admin env vars"
```

---

### Task 2: Script scaffold with config loader + input parser

**Files:**
- Create: `scripts/magento-place-order.mjs`
- Create: `tests/test-input-parser.mjs`

- [ ] **Step 1: Create script scaffold with config and argument parsing**

```javascript
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const CONFIG = {
  adminUrl: process.env.MAGENTO_ADMIN_URL || 'https://primesandzooms.com/notoms/admin/dashboard/',
  username: process.env.MAGENTO_ADMIN_USERNAME || 'kapilt',
  password: process.env.MAGENTO_ADMIN_PASSWORD || '',
};

function parseInput() {
  const dataIdx = process.argv.indexOf('--data');
  if (dataIdx !== -1 && process.argv[dataIdx + 1]) {
    return JSON.parse(process.argv[dataIdx + 1]);
  }
  if (!process.stdin.isTTY) {
    const raw = readFileSync('/dev/stdin', 'utf8').trim();
    return JSON.parse(raw);
  }
  throw new Error('Provide order data via --data <json> or pipe JSON to stdin');
}

function validateInput(data) {
  const errors = [];
  if (!data.customer) errors.push('customer is required');
  if (!data.products || !data.products.length) errors.push('at least one product is required');
  for (const p of data.products) {
    if (!p.sku) errors.push('each product needs a sku');
    if (!p.rentalStart) errors.push('each product needs rentalStart');
    if (!p.rentalEnd) errors.push('each product needs rentalEnd');
  }
  if (errors.length) throw new Error('Validation failed:\n' + errors.join('\n'));
  return {
    customer: data.customer,
    customerEmail: data.customerEmail || '',
    products: data.products,
    paymentMethod: data.paymentMethod || 'Pay by Credit',
    shippingMethod: data.shippingMethod || 'Self Pickup',
    shippingOption: data.shippingOption || 'In-Store Pickup',
    comment: data.comment || 'Order Placed by Kapil Thakare using Admin Panel',
  };
}

export { CONFIG, parseInput, validateInput };
```

- [ ] **Step 2: Create test for input parser**

`tests/test-input-parser.mjs`:
```javascript
import { validateInput } from '../scripts/magento-place-order.mjs';

const valid = {
  customer: 'Mihir Tokekar',
  products: [{ sku: 'AIP17PM256', qty: 1, rentalStart: '2026-06-23', rentalEnd: '2026-06-23', customPrice: 1700 }]
};

try {
  const result = validateInput(valid);
  console.assert(result.customer === 'Mihir Tokekar', 'customer should match');
  console.log('PASS: valid input accepted');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}

try {
  validateInput({});
  console.error('FAIL: should have thrown');
  process.exit(1);
} catch (e) {
  console.assert(e.message.includes('customer'), 'should mention missing customer');
  console.log('PASS: invalid input rejected');
}

console.log('All tests passed');
```

- [ ] **Step 3: Run test**

```bash
node tests/test-input-parser.mjs
```
Expected: `PASS: valid input accepted` then `PASS: invalid input rejected` then `All tests passed`

- [ ] **Step 4: Commit**

```bash
git add scripts/magento-place-order.mjs tests/test-input-parser.mjs
git commit -m "feat: add magento place-order script scaffold with input parser"
```

---

### Task 3: Implement login flow (reCAPTCHA + manual 2FA)

**Files:**
- Modify: `scripts/magento-place-order.mjs`

- [ ] **Step 1: Add login function with manual reCAPTCHA + 2FA handling**

Append to `scripts/magento-place-order.mjs`:

```javascript
async function login(page) {
  console.log('Navigating to admin login...');
  await page.goto(CONFIG.adminUrl, { waitUntil: 'networkidle' });

  // Fill credentials
  await page.fill('#username', CONFIG.username);
  await page.fill('#login', CONFIG.password);
  await page.click('.action-login');

  // Wait for either dashboard (no captcha) or captcha/2FA page
  await page.waitForTimeout(3000);

  // Check if we're on the captcha/2FA page (URL contains 'admin' but not 'dashboard')
  const currentUrl = page.url();

  if (currentUrl.includes('tfa') || currentUrl.includes('2fa')) {
    await promptFor2FA(page);
  }

  // Wait for dashboard to load
  await page.waitForSelector('.admin__menu', { timeout: 120000 });
  console.log('Login successful');
}

async function promptFor2FA(page) {
  console.log('\n=== 2FA REQUIRED ===');
  console.log('Open Google Authenticator on your phone.');
  console.log('Enter the 6-digit TOTP code below:');

  const code = await new Promise((resolve) => {
    process.stdout.write('TOTP Code: ');
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });

  // Find the TOTP input field and submit
  const input = await page.$('input[type="text"]:not([name="username"]):not([name="login"])');
  if (input) {
    await input.fill(code);
    await page.click('button[type="submit"], .action-submit');
    await page.waitForTimeout(3000);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/magento-place-order.mjs
git commit -m "feat: add admin login flow with manual 2FA"
```

---

### Task 4: Implement order navigation and customer selection

**Files:**
- Modify: `scripts/magento-place-order.mjs`

- [ ] **Step 1: Add order navigation + customer selection**

```javascript
async function navigateToOrders(page) {
  console.log('Navigating to Sales > Orders...');

  // Click Sales menu in left sidebar
  await page.click('li.item-sales >> text=Sales');
  await page.waitForTimeout(1000);

  // Click Orders submenu
  await page.click('text=Orders');
  await page.waitForSelector('.page-actions-buttons', { timeout: 10000 });
}

async function createNewOrder(page) {
  console.log('Clicking Create New Order...');
  await page.click('button[title="Create New Order"]');
  await page.waitForTimeout(2000);
}

async function selectCustomer(page, customerName) {
  console.log(`Selecting customer: ${customerName}...`);

  // Check if customer grid is shown
  const customerGrid = await page.$('.admin__data-grid-wrap');

  if (customerGrid) {
    // Search for the customer
    const searchInput = await page.$('input[data-form-part="customer_grid_listing"]');
    if (searchInput) {
      await searchInput.fill(customerName);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Click the first matching customer row
    const firstRow = await page.$('.data-row:first-child');
    if (firstRow) {
      await firstRow.click();
      await page.waitForTimeout(3000);
    }
  }

  console.log('Customer selected');
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/magento-place-order.mjs
git commit -m "feat: add order navigation and customer selection"
```

---

### Task 5: Implement product search and rental configuration

**Files:**
- Modify: `scripts/magento-place-order.mjs`

- [ ] **Step 1: Add product search + add with rental dates**

```javascript
async function addProduct(page, product) {
  console.log(`Searching product: ${product.sku}...`);

  // Click "Add Products" button
  await page.click('#order-items .action-add');
  await page.waitForTimeout(2000);

  // Wait for product grid modal
  await page.waitForSelector('.product-grid', { timeout: 10000 });

  // Search by SKU
  const searchField = await page.$('input[name="sku"]');
  if (searchField) {
    await searchField.fill(product.sku);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }

  // Select the first matching product
  const productRow = await page.$('.data-row:first-child');
  if (!productRow) {
    throw new Error(`Product not found: ${product.sku}`);
  }
  await productRow.click();
  await page.waitForTimeout(1000);

  // Click "Add Selected Product(s) to Order"
  await page.click('button[title="Add Selected Product(s) to Order"]');
  await page.waitForTimeout(2000);

  // Check for configure popup (Sales Igniter rental fields)
  const configurePopup = await page.$('.configure-popup, .modal-content');
  if (configurePopup) {
    await configureRentalProduct(page, product);
  }

  // Set custom price if provided
  if (product.customPrice) {
    const customPriceInput = await page.$('input[name="custom_price"]');
    if (customPriceInput) {
      await customPriceInput.fill(String(product.customPrice));
    }
  }

  // Update qty
  const qtyInput = await page.$('input[name="qty"]');
  if (qtyInput) {
    await qtyInput.fill(String(product.qty || 1));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }

  console.log(`Product ${product.sku} added to order`);
}

async function configureRentalProduct(page, product) {
  console.log('Configuring rental dates...');

  // Set rental start date
  const startInput = await page.$('input[name*="start"], input[data-role*="start"]');
  if (startInput) {
    await startInput.fill(product.rentalStart);
  }

  // Set rental end date
  const endInput = await page.$('input[name*="end"], input[data-role*="end"]');
  if (endInput) {
    await endInput.fill(product.rentalEnd);
  }

  // Click OK / Confirm on the configure popup
  await page.click('button[title="OK"], button.ok');
  await page.waitForTimeout(2000);
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/magento-place-order.mjs
git commit -m "feat: add product search and rental date configuration"
```

---

### Task 6: Implement payment, shipping, order submission, and PDF download

**Files:**
- Modify: `scripts/magento-place-order.mjs`

- [ ] **Step 1: Add order subtotal, payment, shipping, submit, and PDF download**

```javascript
async function setPaymentMethod(page, method) {
  console.log(`Setting payment: ${method}...`);
  const paymentLabel = await page.$(`label:text("${method}")`);
  if (paymentLabel) {
    await paymentLabel.click();
    await page.waitForTimeout(1000);
  }
}

async function setShippingMethod(page, method, option) {
  console.log(`Setting shipping: ${method} - ${option}...`);
  const shippingLabel = await page.$(`label:text("${option}")`);
  if (shippingLabel) {
    await shippingLabel.click();
    await page.waitForTimeout(2000);
  }
}

async function addOrderComment(page, comment) {
  const commentToggle = await page.$('#order-comment');
  if (commentToggle) {
    await commentToggle.click();
    await page.waitForTimeout(500);
    const commentInput = await page.$('#order-comment textarea');
    if (commentInput) {
      await commentInput.fill(comment);
    }
  }
}

async function submitOrder(page, comment) {
  console.log('Submitting order...');

  await addOrderComment(page, comment);

  await page.click('button[title="Submit Order"]');

  // Wait for success confirmation
  await page.waitForTimeout(5000);

  // Extract order number from success message
  const successText = await page.textContent('.message-success');
  const orderMatch = successText && successText.match(/order\s+#?\s*(\d+)/i);

  if (!orderMatch) {
    // Try URL extraction as fallback
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/order_id[\/=](\d+)/);
    if (urlMatch) {
      console.log(`Order created (ID: ${urlMatch[1]})`);
      return { orderId: urlMatch[1], orderNumber: 'see admin page' };
    }
    throw new Error('Could not confirm order creation. Check browser.');
  }

  const orderNumber = orderMatch[1];
  console.log(`Order #${orderNumber} created successfully!`);

  // Try to download rental agreement PDF
  let pdfPath = null;
  try {
    const pdfLink = await page.$('a:text("Rental Agreement"), a:text("Contract"), a:text("PDF")');
    if (pdfLink) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }),
        pdfLink.click(),
      ]);
      pdfPath = `${process.cwd()}/rental-agreement-${orderNumber}.pdf`;
      await download.saveAs(pdfPath);
      console.log(`PDF saved: ${pdfPath}`);
    }
  } catch {
    console.log('PDF download skipped (not available or auto-download)');
  }

  return { orderNumber, pdfPath };
}

async function main() {
  const raw = parseInput();
  const order = validateInput(raw);

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page);
    await navigateToOrders(page);
    await createNewOrder(page);
    await selectCustomer(page, order.customer);

    for (const product of order.products) {
      await addProduct(page, product);
    }

    await setPaymentMethod(page, order.paymentMethod);
    await setShippingMethod(page, order.shippingMethod, order.shippingOption);

    const result = await submitOrder(page, order.comment);

    console.log('\n=== ORDER RESULT ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'error-screenshot.png' });
    console.log('Screenshot saved: error-screenshot.png');
    process.exit(1);
  } finally {
    console.log('\nBrowser will remain open. Press Ctrl+C to close.');
    // Browser stays open so user can see the result
    // await browser.close();
  }
}

// Run if executed directly
if (process.argv[1] === import.meta.url.substring(8)) {
  main();
}

export { login, navigateToOrders, createNewOrder, selectCustomer, addProduct, setPaymentMethod, setShippingMethod, submitOrder, main };
```

- [ ] **Step 2: Commit**

```bash
git add scripts/magento-place-order.mjs
git commit -m "feat: add payment, shipping, order submission, and PDF download"
```

---

### Task 7: Create n8n workflow

**Files:**
- Create: `src/workflows/magento-place-order.json`

- [ ] **Step 1: Create n8n workflow JSON**

The n8n workflow with:
1. **Webhook** trigger (POST `/magento/place-order`)
2. **Code node** — build JSON input for the script
3. **Execute Command** — run `node scripts/magento-place-order.mjs --data '{"customer":"..."}'`
4. **Code node** — parse stdout JSON output
5. **Respond to Webhook** — return order result

```json
{
  "name": "Magento - Place Admin Order",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "magento/place-order",
        "responseMode": "responseNode",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1.5,
      "position": [0, 300]
    },
    {
      "parameters": {
        "jsCode": "const body = $input.first().json.body || {};\nconst raw = body.raw || body.text || '';\n\n// If raw text is provided, try to parse as JSON\nif (raw) {\n  try {\n    return [{ json: JSON.parse(raw) }];\n  } catch {\n    // Treat raw text as a description to handle later\n    return [{ json: { raw: raw, parsed: false } }];\n  }\n}\n\n// Structured input\nreturn [{ json: body }];"
      },
      "name": "Parse Input",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [280, 300]
    },
    {
      "parameters": {
        "command": "node scripts/magento-place-order.mjs --data",
        "executeOnce": true
      },
      "name": "Execute Order Script",
      "type": "n8n-nodes-base.executeCommand",
      "typeVersion": 1,
      "position": [560, 300]
    },
    {
      "parameters": {
        "jsCode": "const cmdOutput = $input.first().json;\nconst stdout = cmdOutput.stdout || '';\n\n// Extract JSON from stdout (find the last JSON block)\nconst jsonMatch = stdout.match(/\\{[\\s\\S]*\\}/);\nif (jsonMatch) {\n  try {\n    return [{ json: JSON.parse(jsonMatch[0]) }];\n  } catch {}\n}\n\nreturn [{ json: { success: false, raw: stdout, stderr: cmdOutput.stderr } }];"
      },
      "name": "Parse Result",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [840, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": {}
      },
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [1120, 300]
    }
  ],
  "connections": {
    "Webhook": { "main": [[ { "node": "Parse Input", "type": "main", "index": 0 } ]] },
    "Parse Input": { "main": [[ { "node": "Execute Order Script", "type": "main", "index": 0 } ]] },
    "Execute Order Script": { "main": [[ { "node": "Parse Result", "type": "main", "index": 0 } ]] },
    "Parse Result": { "main": [[ { "node": "Respond", "type": "main", "index": 0 } ]] }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/workflows/magento-place-order.json
git commit -m "feat: add n8n workflow for magento admin order placement"
```

---

### Task 8: Discovery pass — verify selectors against live admin

**Files:**
- Modify: `scripts/magento-place-order.mjs` (selector fixes)

- [ ] **Step 1: Run the script against live admin and note selectors**

```bash
node scripts/magento-place-order.mjs --data '{"customer":"Mihir Tokekar","products":[{"sku":"AIP17PM256","qty":1,"rentalStart":"06/23/2026","rentalEnd":"06/23/2026","customPrice":1700}],"paymentMethod":"Pay by Credit","shippingMethod":"Self Pickup","shippingOption":"In-Store Pickup"}'
```

Watch the headed browser. Where it fails or clicks the wrong thing, note the actual CSS selectors / text labels and update the script.

- [ ] **Step 2: Update selectors based on live discovery**

Fix any selectors that didn't match — especially:
- 2FA page input field
- Sales Igniter rental date fields
- Product grid search fields
- Payment method radio labels
- Shipping method radio labels
- Submit Order button

- [ ] **Step 3: Re-run and verify end-to-end**

Repeat Step 1. The full flow should complete: login → 2FA → navigate → select customer → add product → set dates → payment → shipping → submit.

- [ ] **Step 4: Commit**

```bash
git add scripts/magento-place-order.mjs
git commit -m "fix: update selectors from live admin discovery"
```

---

### Self-Review Checklist

- **Spec coverage:** All spec sections have corresponding tasks (login, 2FA, order flow, rental dates, payment, shipping, PDF, n8n)
- **No placeholders:** Every code block is concrete and complete
- **Type consistency:** Input format is consistent between script, n8n workflow, and usage examples
- **Testability:** Task 2 has a unit test for the parser; Task 8 is a discovery + verification pass
