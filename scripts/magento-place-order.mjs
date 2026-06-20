import { readFileSync } from 'fs';
import { chromium } from 'playwright';

export const CONFIG = {
  MAGENTO_BASE_URL: process.env.MAGENTO_BASE_URL || 'https://primesandzooms.com/notoms',
  MAGENTO_ADMIN_USERNAME: process.env.MAGENTO_ADMIN_USERNAME || 'kapilt',
  MAGENTO_ADMIN_PASSWORD: process.env.MAGENTO_ADMIN_PASSWORD || '',
  get ADMIN_URL() {
    return `${this.MAGENTO_BASE_URL}/admin/dashboard/`;
  },
};

export function parseInput() {
  const dataIndex = process.argv.indexOf('--data');
  if (dataIndex !== -1 && process.argv[dataIndex + 1]) {
    return JSON.parse(process.argv[dataIndex + 1]);
  }

  if (!process.stdin.isTTY) {
    const input = readFileSync(process.stdin.fd, 'utf-8').trim();
    if (input) {
      return JSON.parse(input);
    }
  }

  throw new Error('No input provided. Use --data <json> or pipe JSON via stdin.');
}

export function validateInput(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Input must be a non-null object.');
  }

  if (!data.customer || typeof data.customer !== 'string') {
    throw new Error('Missing required field: customer (string).');
  }

  if (!Array.isArray(data.products) || data.products.length === 0) {
    throw new Error('Missing required field: products (non-empty array).');
  }

  const { products } = data;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    if (!product.sku || typeof product.sku !== 'string') {
      throw new Error(`Products[${i}] missing required field: sku (string).`);
    }

    if (!product.rentalStart || typeof product.rentalStart !== 'string') {
      throw new Error(`Products[${i}] missing required field: rentalStart (string).`);
    }

    if (!product.rentalEnd || typeof product.rentalEnd !== 'string') {
      throw new Error(`Products[${i}] missing required field: rentalEnd (string).`);
    }
  }

  return {
    customer: data.customer,
    products: data.products.map((p) => ({
      sku: p.sku,
      rentalStart: p.rentalStart,
      rentalEnd: p.rentalEnd,
      qty: p.qty ?? 1,
      customPrice: p.customPrice ?? null,
      rent: p.rent ?? null,
    })),
    customerEmail: data.customerEmail ?? null,
    paymentMethod: data.paymentMethod ?? 'Pay by Credit',
    shippingMethod: data.shippingMethod ?? 'Self Pickup',
    shippingOption: data.shippingOption ?? 'In-Store Pickup',
    comment: data.comment ?? 'Order Placed by Kapil Thakare using Admin Panel',
  };
}

function readStdinLine() {
  return new Promise((resolve) => {
    process.stdin.once('data', (buf) => resolve(buf.toString().trim()));
  });
}

async function promptFor2FA(page) {
  console.log('\n=== 2FA REQUIRED ===');
  console.log('Open Google Authenticator on your phone.');
  process.stdout.write('TOTP Code: ');
  const code = await readStdinLine();

  const totpInput = await page.$('input[name^="totp"]') || await page.$('input[type="text"]:not(#username):not(#login)');
  if (totpInput) {
    await totpInput.fill(code);
  }

  const submitBtn = await page.$('button[type="submit"], .action-primary, .action-submit');
  if (submitBtn) {
    await submitBtn.click();
  }

  await page.waitForTimeout(3000);
  console.log('2FA verified');
}

async function launchBrowser() {
  console.log('\nStep 1: Launching Chrome...');
  const userDataDir = './.magento-browser-data';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}

async function manualLogin(page) {
  console.log('\n=== MANUAL LOGIN REQUIRED ===');
  console.log('A Chrome window has opened.');
  console.log('1. The page will navigate to the admin URL.');
  console.log('2. If Cloudflare appears — solve it manually.');
  console.log('3. Log in with your credentials + 2FA.');
  console.log('4. Wait until you see the admin dashboard.');
  console.log('5. Then come back here and press Enter to continue.\n');
  await page.goto(CONFIG.ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  console.log('Navigated to admin. Press Enter in this terminal once you are logged in and see the dashboard...');
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));
  await page.waitForTimeout(2000);
  console.log('Continuing with order placement...');
}

async function navigateToOrders(page) {
  await page.click('li.item-sales >> text=Sales');
  await page.waitForTimeout(1000);
  await page.click('text=Orders');
  await page.waitForSelector('.page-actions-buttons', { timeout: 10000 });
  console.log('Navigated to Sales > Orders');
}

async function createNewOrder(page) {
  await page.click('button[title="Create New Order"]');
  await page.waitForTimeout(2000);
  console.log('Create New Order button clicked');
}

async function selectCustomer(page, customerName) {
  console.log(`Selecting customer: ${customerName}...`);
  await page.waitForTimeout(2000);
  await page.waitForSelector('#sales_order_create_customer_grid_table tbody tr', { timeout: 15000 });
  const cell = page.locator('#sales_order_create_customer_grid_table tbody tr td:nth-child(2)')
    .filter({ hasText: customerName })
    .first();
  await cell.waitFor({ state: 'visible', timeout: 10000 });
  await cell.click();
  await page.waitForTimeout(3000);
  console.log('Customer selected');
}

async function configureRentalProduct(page, product) {
  console.log('Configuring rental dates...');
  const startInput = await page.$('input[name*="start"], input[data-role*="start"], input[class*="start"]');
  if (startInput) await startInput.fill(product.rentalStart);
  const endInput = await page.$('input[name*="end"], input[data-role*="end"], input[class*="end"]');
  if (endInput) await endInput.fill(product.rentalEnd);
  const okBtn = await page.$('button.ok, button[title="OK"], button:has-text("OK"), button:has-text("Confirm")');
  if (okBtn) await okBtn.click();
  await page.waitForTimeout(2000);
  console.log('Rental dates configured');
}

async function addProduct(page, product) {
  console.log(`Searching product: ${product.sku}...`);
  await page.click('#order-items .action-add');
  await page.waitForTimeout(2000);
  await page.waitForSelector('.product-grid, .modal-content', { timeout: 10000 });
  const skuInput = await page.$('input[name="sku"]');
  if (skuInput) {
    await skuInput.fill(product.sku);
    await skuInput.press('Enter');
  }
  await page.waitForTimeout(2000);
  const row = await page.$('.data-row:first-child');
  if (!row) throw new Error(`Product not found: ${product.sku}`);
  await row.click();
  await page.waitForTimeout(1000);
  const addBtn = await page.$('button[title*="Add Selected"]');
  if (addBtn) await addBtn.click();
  await page.waitForTimeout(2000);
  const configurePopup = await page.$('.configure-popup, .modal-content:visible');
  if (configurePopup) await configureRentalProduct(page, product);
  if (product.customPrice) {
    const priceInput = await page.$('input[name="custom_price"], input[data-role*="custom_price"]');
    if (priceInput) await priceInput.fill(String(product.customPrice));
  }
  const qtyInput = await page.$('input[name="qty"]');
  if (qtyInput) {
    await qtyInput.fill(String(product.qty || 1));
    await qtyInput.press('Enter');
  }
  await page.waitForTimeout(2000);
  console.log(`Product ${product.sku} added to order`);
}

async function setPaymentMethod(page, method) {
  console.log(`Setting payment: ${method}...`);
  await page.locator('label').filter({ hasText: method }).click();
  await page.waitForTimeout(1000);
  console.log('Payment method set');
}

async function setShippingMethod(page, option) {
  console.log(`Setting shipping: ${option}...`);
  await page.locator('label').filter({ hasText: option }).click();
  await page.waitForTimeout(2000);
  console.log('Shipping method set');
}

async function addOrderComment(page, comment) {
  const toggle = await page.$('#order-comment');
  if (toggle) {
    await toggle.click();
    await page.waitForTimeout(500);
  }
  const textarea = await page.$('#order-comment textarea');
  if (textarea) await textarea.fill(comment);
}

async function submitOrder(page, order) {
  await addOrderComment(page, order.comment);
  await page.click('button[title="Submit Order"]');
  await page.waitForTimeout(5000);
  const successEl = await page.$('.order-success-message, .message-success, .message');
  let orderNumber = null;
  if (successEl) {
    const text = await successEl.textContent();
    const match = text.match(/order\s+#?\s*(\d+)/i);
    if (match) orderNumber = match[1];
  }
  if (!orderNumber) {
    const urlMatch = page.url().match(/order_id[/=](\d+)/);
    if (urlMatch) orderNumber = urlMatch[1];
  }
  if (!orderNumber) throw new Error('Could not confirm order creation. Check browser.');
  console.log(`Order #${orderNumber} created successfully!`);
  let pdfPath = null;
  const pdfLink = await page.$('a:has-text("Rental Agreement"), a:has-text("Contract"), a:has-text("PDF")');
  if (pdfLink) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }),
        pdfLink.click(),
      ]);
      pdfPath = `rental-agreement-${orderNumber}.pdf`;
      await download.saveAs(pdfPath);
      console.log(`PDF saved: ${pdfPath}`);
    } catch {
      console.log('PDF download skipped');
    }
  }
  return { orderNumber, pdfPath };
}

async function main() {
  const raw = parseInput();
  const order = validateInput(raw);

  const connectMode = process.argv.includes('--connect');

  let browser, context, page;

  if (connectMode) {
    console.log('Connecting to existing Chrome at http://127.0.0.1:9222...');
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0];
    context = ctx;
    console.log('Connected. Current URL:', page.url());
    console.log('Navigating to admin dashboard...');
    await page.goto(CONFIG.ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.admin__menu', { timeout: 15000 });
  } else {
    ({ context, page } = await launchBrowser());
    await manualLogin(page);
  }

  try {
    console.log(`\nPlacing order for customer: ${order.customer}`);
    await navigateToOrders(page);
    await createNewOrder(page);
    await selectCustomer(page, order.customer);
    for (const product of order.products) {
      await addProduct(page, product);
    }

    await setPaymentMethod(page, order.paymentMethod);
    await setShippingMethod(page, order.shippingOption);

    const result = await submitOrder(page, order);

    console.log('\n=== ORDER RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('\nBrowser will remain open. Press Ctrl+C to close.');
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'error-screenshot.png' });
    console.log('Screenshot saved: error-screenshot.png');
    process.exit(1);
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
