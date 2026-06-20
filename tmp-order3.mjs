import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];

// Search for Shirurkar in customer grid
const nameInput = await p.$('#sales_order_create_customer_grid_filter_name');
if (nameInput) {
  await nameInput.fill('Shirurkar');
  console.log('Filled name filter: Shirurkar');
}

// Click Search button
await p.click('button[title="Search"]');
await p.waitForTimeout(3000);

// Check results
const result = await p.evaluate(() => {
  const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
  const customers = [...rows].slice(0, 5).map(r => ({
    id: r.querySelector('td:nth-child(1)')?.innerText?.trim(),
    name: r.querySelector('td:nth-child(2)')?.innerText?.trim(),
    email: r.querySelector('td:nth-child(3)')?.innerText?.trim(),
    group: r.querySelector('td:nth-child(4)')?.innerText?.trim(),
    phone: r.querySelector('td:nth-child(5)')?.innerText?.trim(),
    postcode: r.querySelector('td:nth-child(6)')?.innerText?.trim(),
    region: r.querySelector('td:nth-child(7)')?.innerText?.trim(),
    store: r.querySelector('td:nth-child(8)')?.innerText?.trim(),
    website: r.querySelector('td:nth-child(9)')?.innerText?.trim(),
  }));
  return { count: rows.length, customers };
});

if (result.count > 0) {
  console.log('Found:', JSON.stringify(result, null, 2));
} else {
  console.log('No results. Let me try searching for "Pran"...');
  // Reset and try Pran
  await p.click('button[title="Reset Filter"]');
  await p.waitForTimeout(1000);
  const nameInput2 = await p.$('#sales_order_create_customer_grid_filter_name');
  if (nameInput2) {
    await nameInput2.fill('Pran');
  }
  await p.click('button[title="Search"]');
  await p.waitForTimeout(3000);
  
  const result2 = await p.evaluate(() => {
    const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
    return [...rows].slice(0, 5).map(r => ({
      id: r.querySelector('td:nth-child(1)')?.innerText?.trim(),
      name: r.querySelector('td:nth-child(2)')?.innerText?.trim(),
      email: r.querySelector('td:nth-child(3)')?.innerText?.trim(),
      phone: r.querySelector('td:nth-child(5)')?.innerText?.trim(),
      store: r.querySelector('td:nth-child(8)')?.innerText?.trim(),
    }));
  });
  console.log('Search Pran results:', JSON.stringify(result2));
  
  if (result2.length === 0) {
    console.log('Pran not found. User may need to create customer first.');
  }
}
