import { readFileSync, writeFileSync } from 'fs';
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

async function loadSession(context, sessionPath) {
  try {
    const data = readFileSync(sessionPath, 'utf-8');
    const cookies = JSON.parse(data);
    await context.addCookies(cookies);
    return true;
  } catch {
    return false;
  }
}

async function saveSession(context, sessionPath) {
  const cookies = await context.cookies();
  writeFileSync(sessionPath, JSON.stringify(cookies, null, 2));
  console.log(`Session saved to ${sessionPath}`);
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

async function login(page, sessionPath) {
  await page.goto(CONFIG.ADMIN_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.fill('#username', CONFIG.MAGENTO_ADMIN_USERNAME);
  await page.fill('#login', CONFIG.MAGENTO_ADMIN_PASSWORD);
  await page.click('.action-login');
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  if (currentUrl.includes('tfa') || currentUrl.includes('2fa')) {
    await promptFor2FA(page);
  }

  await page.waitForSelector('.admin__menu', { timeout: 120000 });
  console.log('Login successful');
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
  const gridExists = await page.$('.admin__data-grid-wrap');
  if (gridExists) {
    const searchInput = await page.$('input[data-form-part="customer_grid_listing"]')
      || await page.$('input[type="search"]');
    if (searchInput) {
      await searchInput.fill(customerName);
      await searchInput.press('Enter');
    }
    await page.waitForTimeout(2000);
    await page.click('.data-row:first-child');
    await page.waitForTimeout(3000);
  }
  console.log('Customer selected');
}

async function main() {
  const raw = parseInput();
  const order = validateInput(raw);

  const sessionPath = './.magento-session.json';
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  await loadSession(context, sessionPath);
  const page = await context.newPage();

  try {
    await login(page, sessionPath);
    await saveSession(context, sessionPath);

    console.log(`\nPlacing order for customer: ${order.customer}`);
    await navigateToOrders(page);
    await createNewOrder(page);
    await selectCustomer(page, order.customer);
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
