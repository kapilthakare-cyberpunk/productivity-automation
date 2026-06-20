import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
console.log('Current URL:', p.url().substring(0, 100));

// Navigate to admin
await p.goto('https://primesandzooms.com/notoms/admin/dashboard/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForTimeout(2000);
console.log('Title:', await p.title());

// Check if logged in
const menu = await p.waitForSelector('.admin__menu', { timeout: 5000 }).catch(() => null);
if (menu) {
  console.log('Logged in - proceeding');
  // Navigate to Sales > Orders > Create New Order
  await p.click('li.item-sales >> text=Sales');
  await p.waitForTimeout(1500);
  await p.click('text=Orders');
  await p.waitForSelector('.page-actions-buttons', { timeout: 10000 });
  console.log('At Orders page');
  await p.click('button[title="Create New Order"]');
  await p.waitForTimeout(3000);
  console.log('URL:', p.url());
  
  // Check customer grid
  const table = await p.$('#sales_order_create_customer_grid_table');
  if (table) {
    const customers = await p.evaluate(() => {
      const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
      return [...rows].slice(0, 25).map(r => ({
        name: r.querySelector('td:nth-child(2)')?.innerText?.trim(),
        email: r.querySelector('td:nth-child(3)')?.innerText?.trim(),
        group: r.querySelector('td:nth-child(4)')?.innerText?.trim(),
        phone: r.querySelector('td:nth-child(5)')?.innerText?.trim(),
      }));
    });
    console.log('First 25 customers:');
    customers.forEach((c, i) => console.log(i+1 + '. ' + c.name + ' | ' + c.email + ' | ' + c.phone));
    
    // Check for Pran
    const pran = customers.find(c => c.name?.toLowerCase().includes('pran') || c.name?.toLowerCase().includes('shirurkar'));
    if (pran) {
      console.log('FOUND Pran:', JSON.stringify(pran));
    } else {
      console.log('Pran NOT found in first 25 customers');
      // Check grid structure
      const gridInfo = await p.evaluate(() => {
        const grid = document.querySelector('#sales_order_create_customer_grid_table');
        return {
          id: grid?.id,
          class: grid?.className,
          theadRows: grid?.querySelectorAll('thead tr')?.length,
          tbodyRows: grid?.querySelectorAll('tbody tr')?.length,
          sample: grid?.querySelector('tr')?.innerHTML?.substring(0, 300),
        };
      });
      console.log('Grid info:', JSON.stringify(gridInfo));
    }
  } else {
    console.log('Customer grid table NOT found');
    // Search for any table with customer data
    const allTables = await p.evaluate(() => {
      return [...document.querySelectorAll('table')].map(t => ({
        id: t.id,
        class: t.className?.substring(0, 100),
        cols: t.querySelectorAll('tr').length,
        headers: [...t.querySelectorAll('th')].map(th => th.innerText?.trim()).filter(Boolean).slice(0, 3),
      }));
    });
    console.log('All tables:', JSON.stringify(allTables, null, 2));
  }
} else {
  console.log('Not logged in. URL:', p.url());
}
