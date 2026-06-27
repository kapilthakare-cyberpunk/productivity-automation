import { readFileSync, existsSync } from 'fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.MAGENTO_BASE_URL || 'https://primesandzooms.com/notoms';
const ADMIN_URL = `${BASE_URL}/admin/dashboard/`;

const SKUS = [
  'SFX3', 'SFE2470F282', 'SFE1635F282', 'SFE50F12', 'SFE70200F282',
  'LLBM150', '82VND15', 'DJIRS4P', 'CMATTDTSR', 'HLMR4K',
  'BMATMP', 'APNP300C', 'APLS600D', 'GF400BI', 'UHDMI30FT',
  'UHDMI15FT', 'SFE85F18', 'PF160CEA800',
];

const TARGET_DATE = '28 Jun 2025';

const BOOKING_URLS = [
  `${BASE_URL}/admin/rental/booking/index/`,
  `${BASE_URL}/admin/rental_booking/booking/index/`,
  `${BASE_URL}/admin/rental/reservation/index/`,
  `${BASE_URL}/admin/rental_reservation/reservation/index/`,
  `${BASE_URL}/admin/salesigniter/booking/booking/index/`,
  `${BASE_URL}/admin/rental/booking/`,
  `${BASE_URL}/admin/rental_booking/booking/`,
  `${BASE_URL}/admin/rental/reservation/`,
  `${BASE_URL}/admin/rental_reservation/reservation/`,
];

async function tryMenuNavigation(page) {
  console.log('\nTrying to find SalesIgniter menu section...');
  const menuItems = await page.$$('.admin__menu .item > a, .admin__menu .item > span');
  for (const item of menuItems) {
    const text = await item.textContent();
    console.log(`  Menu item: ${text?.trim()}`);
  }
  const rentalLinks = await page.$$('a:has-text("Rental"), a:has-text("SalesIgniter"), a:has-text("Booking"), a:has-text("Reservation")');
  for (const link of rentalLinks) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    console.log(`  Link found: "${text?.trim()}" -> ${href || '(no href)'}`);
  }
  return rentalLinks;
}

async function tryBookingUrls(page) {
  for (const url of BOOKING_URLS) {
    try {
      console.log(`\nTrying: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      const title = await page.title();
      const bodyText = await page.locator('body').innerText();
      const isBookingPage = bodyText.includes('booking') || bodyText.includes('Booking') ||
        bodyText.includes('reservation') || bodyText.includes('Reservation') ||
        bodyText.includes('grid') || bodyText.includes('filter');
      if (!bodyText.includes('404') && !bodyText.includes('Not Found') && !bodyText.includes('Page not found')) {
        console.log(`  Title: ${title}`);
        console.log(`  URL: ${page.url()}`);
        const hasTable = await page.$('#rental_booking_grid_table, .data-grid, table.data-table');
        if (hasTable) {
          console.log('  ✓ Found booking grid!');
          return url;
        }
        const hasFilterForm = await page.$('.filter, .admin__data-grid-filters, form');
        if (hasFilterForm) {
          console.log('  ✓ Has filter form - might be booking page');
        }
      } else {
        console.log('  ✗ 404 or Not Found');
      }
    } catch (e) {
      console.log(`  ✗ Error: ${e.message.slice(0, 100)}`);
    }
  }
  return null;
}

async function checkMenuSection(page) {
  console.log('\n--- Current page URL: ' + page.url() + ' ---');
  await page.waitForTimeout(1000);
  const allLinks = await page.$$eval('a[href]', links =>
    links
      .map(l => ({ text: l.textContent.trim(), href: l.href }))
      .filter(l => l.href.includes('rental') || l.href.includes('booking') || l.href.includes('reservation'))
  );
  if (allLinks.length > 0) {
    console.log('Found rental-related links:');
    for (const link of allLinks) {
      console.log(`  "${link.text}" -> ${link.href}`);
    }
    return allLinks.filter(l => l.href.includes('rental') || l.href.includes('booking') || l.href.includes('reservation'));
  }
  return [];
}

async function filterBySkuAndDate(page, bookingUrl) {
  console.log('\n=== Checking each SKU for bookings on 28th June ===\n');
  const conflicts = [];
  for (const sku of SKUS) {
    try {
      console.log(`Checking ${sku}...`);
      await page.goto(bookingUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const skuInput = await page.$('input[name="sku"], input[data-role="sku"], input[name*="sku"]');
      if (skuInput) {
        await skuInput.fill(sku);
        await skuInput.press('Enter');
        await page.waitForTimeout(2000);
      }
      const dateInput = await page.$('input[name*="date"], input[data-role*="date"], input[name*="from"], input[name*="start"]');
      if (dateInput) {
        await dateInput.fill(TARGET_DATE);
        await dateInput.press('Enter');
        await page.waitForTimeout(2000);
      }
      const rows = await page.$$('.data-row, tr.data-row');
      if (rows.length > 0) {
        const rowText = await rows[0].textContent();
        if (rowText && !rowText.includes('No records') && !rowText.includes('no records')) {
          console.log(`  ⚠️  ${sku}: Has existing bookings!`);
          conflicts.push({ sku, details: rowText.trim().slice(0, 200) });
        } else {
          console.log(`  ✓ ${sku}: No conflicting bookings`);
        }
      } else {
        const bodyText = await page.locator('body').innerText();
        if (bodyText.includes('no records') || bodyText.includes('No records')) {
          console.log(`  ✓ ${sku}: No conflicting bookings`);
        } else {
          console.log(`  ? ${sku}: Could not determine (no rows found)`);
        }
      }
    } catch (e) {
      console.log(`  ✗ ${sku}: Error - ${e.message.slice(0, 100)}`);
    }
  }
  return conflicts;
}

async function main() {
  console.log('=== Rental Booking Availability Check for 28 June 2025 ===\n');
  const useSession = process.argv.includes('--use-session');
  const userDataDir = './.magento-browser-data';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();
  const page2 = await context.newPage();

  if (useSession) {
    const sfIndex = process.argv.indexOf('--session-file');
    const sessionPath = sfIndex !== -1 ? process.argv[sfIndex + 1] : './magento-session.json';
    if (!existsSync(sessionPath)) {
      console.log('No session file found. Manual login required.');
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
        console.log('Session restored successfully.');
      }
    }
  } else {
    await manualLogin(page);
  }

  let bookingUrl = null;
  const rentalSectionLinks = await checkMenuSection(page);
  if (rentalSectionLinks.length > 0) {
    const bookingLink = rentalSectionLinks.find(l =>
      l.text.toLowerCase().includes('booking') || l.text.toLowerCase().includes('reservation')
    );
    if (bookingLink) {
      bookingUrl = bookingLink.href;
      console.log(`\nFound booking link: "${bookingLink.text}" -> ${bookingUrl}`);
    } else {
      console.log('\nFound rental section but no booking/reservation link. Trying first link...');
      bookingUrl = rentalSectionLinks[0].href;
    }
  }

  if (!bookingUrl) {
    console.log('\nCould not find booking link via menu. Trying common URLs...');
    bookingUrl = await tryBookingUrls(page);
  }

  if (!bookingUrl) {
    console.log('\n❌ Could not auto-detect SalesIgniter booking section.');
    console.log('   The browser is open. Please navigate to the Rental → Bookings');
    console.log('   or Rental → Reservations section manually, then press Enter.');
    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));
    bookingUrl = page.url();
    console.log(`Captured URL: ${bookingUrl}`);
  }

  const conflicts = await filterBySkuAndDate(page, bookingUrl);

  console.log('\n=== FINAL SUMMARY ===');
  if (conflicts.length === 0) {
    console.log('✅ All 18 SKUs are available on 28th June 2025 — no rental booking conflicts.');
  } else {
    console.log(`⚠️  ${conflicts.length} SKU(s) have existing bookings on 28th June:`);
    for (const c of conflicts) {
      console.log(`  - ${c.sku}: ${c.details}`);
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
  await new Promise(resolve => process.stdin.once('data', resolve));
  await page.waitForTimeout(2000);
}

main().catch(console.error);
