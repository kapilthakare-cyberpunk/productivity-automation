import { readFileSync, existsSync } from 'fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.MAGENTO_BASE_URL || 'https://primesandzooms.com/notoms';
const ADMIN_URL = `${BASE_URL}/admin/dashboard/`;
const CATALOG_URL = `${BASE_URL}/admin/catalog/product/index/`;

const SKUS = [
  'SFX3',
  'SFE2470F282',
  'SFE1635F282',
  'SFE50F12',
  'SFE70200F282',
  'LLBM150',
  '82VND15',
  'DJIRS4P',
  'CMATTDTSR',
  'HLMR4K',
  'BMATMP',
  'APNP300C',
  'APLS600D',
  'GF400BI',
  'UHDMI30FT',
  'UHDMI15FT',
  'SFE85F18',
  'PF160CEA800',
];

async function checkAvailability(page, sku) {
  await page.goto(CATALOG_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.fill('input[name="sku"]', sku);
  await page.press('input[name="sku"]', 'Enter');
  await page.waitForTimeout(2000);

  const row = await page.$('.data-row');
  if (!row) {
    console.log(`  ${sku}: NOT FOUND in catalog`);
    return { sku, found: false, stock: 'NOT FOUND' };
  }

  const stockCell = await page.$('.data-row td:nth-child(8)');
  const stockText = stockCell ? (await stockCell.textContent()).trim() : 'UNKNOWN';

  const nameCell = await page.$('.data-row td:nth-child(3)');
  const name = nameCell ? (await nameCell.textContent()).trim() : sku;

  const qtyCell = await page.$('.data-row td:nth-child(9)');
  const qty = qtyCell ? (await qtyCell.textContent()).trim() : '-';

  console.log(`  ${sku}: [${stockText}] Qty: ${qty} — ${name}`);
  return { sku, found: true, stock: stockText, qty, name };
}

async function main() {
  console.log('=== Product Availability Check ===\n');

  const useSession = process.argv.includes('--use-session');
  const userDataDir = './.magento-browser-data';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();

  if (useSession) {
    const sessionPath = process.argv.find((a, i) => a === '--session-file')
      ? process.argv[process.argv.indexOf('--session-file') + 1]
      : './magento-session.json';

    if (!existsSync(sessionPath)) {
      console.log('No session file found. Will do manual login instead.');
      await manualLogin(page);
    } else {
      const state = JSON.parse(readFileSync(sessionPath, 'utf-8'));
      await context.addCookies(state.cookies);
      await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const menu = await page.$('.admin__menu');
      if (!menu) {
        console.log('Session expired. Manual login required.');
        await manualLogin(page);
      } else {
        console.log('Session restored successfully.\n');
      }
    }
  } else {
    await manualLogin(page);
  }

  const results = [];
  for (const sku of SKUS) {
    console.log(`Checking ${sku}...`);
    const result = await checkAvailability(page, sku);
    results.push(result);
  }

  const unavailable = results.filter(r => r.stock?.toLowerCase().includes('out of stock') || !r.found);
  const available = results.filter(r => r.stock?.toLowerCase().includes('in stock'));

  console.log('\n=== SUMMARY ===');
  console.log(`Available: ${available.length}/${SKUS.length}`);
  console.log(`Issues: ${unavailable.length}/${SKUS.length}`);
  if (unavailable.length > 0) {
    console.log('\n⚠️  ITEMS NEEDING ATTENTION:');
    for (const u of unavailable) {
      console.log(`  ${u.sku} — ${u.stock || 'NOT FOUND'} ${u.name ? '(' + u.name + ')' : ''}`);
    }
  }
  console.log('\nBrowser stays open. Press Ctrl+C to quit.');
}

async function manualLogin(page) {
  console.log('\n=== MANUAL LOGIN REQUIRED ===');
  console.log('A Chrome window has opened.');
  console.log('1. Log in to admin (kapilt + 2FA).');
  console.log('2. Press Enter here once you see the dashboard.\n');
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));
  await page.waitForTimeout(2000);
}

main().catch(console.error);
