import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find(p => !p.url().includes('chrome://') && !p.url().includes('blank')) || pages[0];

// Get current session key from URL
const currentUrl = page.url();
const keyMatch = currentUrl.match(/key\/([a-f0-9]+)/);
if (!keyMatch) throw new Error('No session key found in URL');
const key = keyMatch[1];
console.log('Session key:', key);

// Navigate to Sales > Orders
console.log('Navigating to Sales > Orders...');
await page.goto(`https://primesandzooms.com/notoms/sales/order/index/key/${key}/`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
}).catch(() => {});
await new Promise(r => setTimeout(r, 2000));
console.log('Orders page:', page.url().substring(0, 150));

// Click Create New Order
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Create New Order'));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 3000));
console.log('After create:', page.url().substring(0, 150));

// Search for customer by email
const emailFilter = await page.$('#sales_order_create_customer_grid_filter_email');
if (emailFilter) {
  console.log('Customer grid visible, searching for pran.shirurkar@gmail.com...');
  await emailFilter.type('pran.shirurkar@gmail.com');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Search'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  
  // Click the customer row
  const clicked = await page.evaluate(() => {
    const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
    for (const row of rows) {
      const email = row.querySelector('td:nth-child(3)')?.innerText?.trim();
      if (email === 'pran.shirurkar@gmail.com') {
        row.click();
        return true;
      }
    }
    return false;
  });
  console.log('Customer clicked:', clicked);
} else {
  console.log('Customer grid not visible, page text:', await page.evaluate(() => document.body.innerText.substring(0, 300)));
}

await new Promise(r => setTimeout(r, 3000));
console.log('URL after customer:', page.url().substring(0, 150));

// Check what's on the page now
const html = await page.evaluate(() => {
  const main = document.querySelector('.page-main-actions, .page-content, .page-wrapper')?.innerText;
  return main?.substring(0, 1000);
});
console.log('Page content:', html);

await browser.disconnect();
