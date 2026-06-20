import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find(p => p.url().includes('primesandzooms.com')) || pages[0];

// Navigate to order create page
console.log('Going to order create...');
await page.goto('https://primesandzooms.com/notoms/sales/order_create/index/key/edc6e0a845eab10257deb638ead41f9e3d230515fb291b0fbe07a3911/', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
}).catch(() => {});
await new Promise(r => setTimeout(r, 2000));
console.log('URL:', page.url().substring(0, 130));

// Select the customer first
const custRow = await page.evaluate(() => {
  const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
  for (const r of rows) {
    const email = r.querySelector('td:nth-child(3)')?.innerText?.trim();
    if (email === 'pran.shirurkar@gmail.com') {
      r.click();
      return true;
    }
  }
  return false;
});
if (custRow) {
  console.log('Customer clicked');
  await new Promise(r => setTimeout(r, 3000));
} else {
  // Search for the customer first
  const emailInput = await page.$('#sales_order_create_customer_grid_filter_email');
  if (emailInput) {
    await emailInput.type('pran.shirurkar@gmail.com');
  }
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Search'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  
  // Click customer row
  await page.evaluate(() => {
    const row = document.querySelector('#sales_order_create_customer_grid_table tbody tr');
    if (row) row.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Customer selected after search');
}

console.log('URL after customer:', page.url().substring(0, 130));

// Now click Add Products
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button, a, span')].find(el => el.innerText.includes('Add Products'));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 3000));

// Check if a popup/modal opened
const modalText = await page.evaluate(() => {
  const modals = document.querySelectorAll('.modal-content, .modal-popup, .product-grid, .ui-dialog');
  return [...modals].map(m => m.innerText?.substring(0, 200)).filter(Boolean);
});
console.log('Modal content:', JSON.stringify(modalText, null, 2));

await browser.disconnect();
