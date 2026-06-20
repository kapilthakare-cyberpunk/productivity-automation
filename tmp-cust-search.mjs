import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
console.log('Pages:', pages.length);

// Find the dashboard page (not omnibox popup)
let page = pages.find(p => p.url().includes('primesandzooms.com'));
if (!page) page = pages[0];

console.log('Current URL:', page.url().substring(0, 120));

// Navigate via Sales > Orders button click
// First let's try clicking Sales menu
try {
  const salesMenu = await page.$('[data-ui-id="menu-magento-sales-sales"]');
  if (salesMenu) {
    await salesMenu.click();
    console.log('Clicked Sales menu');
    await new Promise(r => setTimeout(r, 2000));
    
    // Click Orders link
    const ordersLink = await page.$('[data-ui-id*="sales-order"] a, li.item-sales-order a');
    if (ordersLink) {
      await ordersLink.click();
      console.log('Clicked Orders');
      await new Promise(r => setTimeout(r, 3000));
    } else {
      // Maybe the submenu has a different structure
      const links = await page.evaluate(() => {
        const items = document.querySelectorAll('.admin__menu .submenu li a');
        return [...items].map(a => ({ text: a.innerText, href: a.href }));
      });
      console.log('Submenu links:', JSON.stringify(links, null, 2));
    }
  } else {
    console.log('Sales menu not found by data-ui-id');
  }
} catch (e) {
  console.log('Menu click error:', e.message);
}

console.log('After menu URL:', page.url().substring(0, 120));

// Click Create New Order
const createBtn = await page.$('button[title="Create New Order"]');
if (createBtn) {
  await createBtn.click();
  console.log('Clicked Create New Order');
  await new Promise(r => setTimeout(r, 5000));
}

console.log('New URL:', page.url().substring(0, 120));

// Check if we see the customer grid
const custGridText = await page.evaluate(() => {
  const grid = document.getElementById('sales_order_create_customer_grid_table');
  const rows = grid ? document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr') : [];
  return {
    hasGrid: !!grid,
    rowCount: rows?.length || 0,
    bodySample: document.body.innerText.substring(0, 500),
  };
});
console.log('Customer grid:', JSON.stringify(custGridText, null, 2));

// Reset filters
try {
  const resetBtn = await page.$('button[title="Reset Filter"]');
  if (resetBtn) {
    await resetBtn.click();
    await new Promise(r => setTimeout(r, 1000));
  }
} catch(e) {}

// Search by email
const emailInput = await page.$('#sales_order_create_customer_grid_filter_email');
if (emailInput) {
  await emailInput.type('pran.shirurkar@gmail.com');
  console.log('Filled email filter');
}

const searchBtn = await page.$('button[title="Search"]');
if (searchBtn) {
  await searchBtn.click();
  await new Promise(r => setTimeout(r, 5000));
}

const result = await page.evaluate(() => {
  const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
  return [...rows].map(r => ({
    id: r.querySelector('td:nth-child(1)')?.innerText?.trim(),
    name: r.querySelector('td:nth-child(2)')?.innerText?.trim(),
    email: r.querySelector('td:nth-child(3)')?.innerText?.trim(),
    phone: r.querySelector('td:nth-child(5)')?.innerText?.trim(),
  }));
});
console.log('Count:', result.length);
console.log('Results:', JSON.stringify(result, null, 2));

await browser.disconnect();
