import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];

// Reset filter first
await p.click('button[title="Reset Filter"]');
await p.waitForTimeout(1500);

// Try searching for Pran
const nameInput = await p.$('#sales_order_create_customer_grid_filter_name');
if (nameInput) {
  await nameInput.fill('Pran');
  console.log('Filled name: Pran');
}
await p.click('button[title="Search"]');
await p.waitForTimeout(3000);

const result = await p.evaluate(() => {
  const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
  return [...rows].map(r => ({
    id: r.querySelector('td:nth-child(1)')?.innerText?.trim(),
    name: r.querySelector('td:nth-child(2)')?.innerText?.trim(),
    email: r.querySelector('td:nth-child(3)')?.innerText?.trim(),
    phone: r.querySelector('td:nth-child(5)')?.innerText?.trim(),
    store: r.querySelector('td:nth-child(8)')?.innerText?.trim(),
  }));
});
console.log('Search \"Pran\" results (' + result.length + '):', JSON.stringify(result));
