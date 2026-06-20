import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find(p => !p.url().includes('chrome://') && !p.url().includes('blank')) || pages[0];
console.log('Starting URL:', page.url().substring(0, 130));

// Navigate to admin dashboard first (this works)
const baseUrl = 'https://primesandzooms.com/notoms/admin/dashboard/index/key/666482217bc446c1703f29e0844835c3a87728933cbf8a9ca926930494f598c1/';
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2000));

// Click Sales menu, then Orders
console.log('Clicking Sales menu...');
await page.evaluate(() => {
  const li = [...document.querySelectorAll('li')].find(el => el.innerText.startsWith('Sales'));
  if (li) {
    li.classList.add('_active');
    const orders = [...li.querySelectorAll('a, span')].find(el => el.innerText.includes('Orders'));
    if (orders) orders.click();
  }
});
await new Promise(r => setTimeout(r, 4000));
console.log('URL after menu:', page.url().substring(0, 130));

// Check for Cloudflare
const isCloudflare = await page.evaluate(() => document.body.innerText.includes('Cloudflare'));
if (isCloudflare) {
  console.log('CLOUDFLARE TRIGGERED via menu!');
  // Wait for manual solve
  console.log('Please solve the Cloudflare challenge in the browser window...');
  await new Promise(r => setTimeout(r, 30000));
}

// Click Create New Order
console.log('Clicking Create New Order...');
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Create New Order'));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 4000));
console.log('Create order URL:', page.url().substring(0, 150));

// Check for Cloudflare again
const cf2 = await page.evaluate(() => document.body.innerText.includes('Cloudflare'));
if (cf2) {
  console.log('CLOUDFLARE AGAIN on create order. Need manual solve.');
  // This is a manual process, let the user handle it interactively
  // For now let's just check what we see
  await new Promise(r => setTimeout(r, 2000));
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Body:', bodyText);
  await browser.disconnect();
}

// Now search for customer
console.log('Searching for customer...');
await page.evaluate(() => {
  const inp = document.querySelector('#sales_order_create_customer_grid_filter_email');
  if (inp) {
    inp.value = 'pran.shirurkar@gmail.com';
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Search'));
    if (btn) btn.click();
  }
});
await new Promise(r => setTimeout(r, 3000));

// Click customer row
const clicked = await page.evaluate(() => {
  const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
  for (const row of rows) {
    const email = row.querySelector('td:nth-child(3)')?.innerText?.trim();
    if (email === 'pran.shirurkar@gmail.com') {
      row.click();
      return 'found and clicked';
    }
  }
  return 'not found';
});
console.log('Customer result:', clicked);
await new Promise(r => setTimeout(r, 3000));

console.log('Final URL:', page.url().substring(0, 150));

await browser.disconnect();
