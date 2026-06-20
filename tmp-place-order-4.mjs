import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find(p => !p.url().includes('chrome://') && !p.url().includes('blank')) || pages[0];
console.log('Current URL:', page.url().substring(0, 200));

// Check page state without navigating
const state = await page.evaluate(() => {
  const text = document.body.innerText;
  const cf = text.includes('Cloudflare');
  const oms = text.includes('OMS') || text.includes('pnz');
  const dashboard = !!document.querySelector('.admin__menu');
  const customerGrid = !!document.querySelector('#sales_order_create_customer_grid_table');
  const loginForm = !!document.querySelector('#username');
  return { cf, oms, dashboard, customerGrid, loginForm, snippet: text.substring(0, 300) };
});
console.log('Page state:', JSON.stringify(state, null, 2));

if (!state.cf && !state.oms && state.dashboard) {
  console.log('Admin is visible, checking customer grid...');
  if (state.customerGrid) {
    console.log('Customer grid is already showing!');
    // We're on the order_create page - proceed!
    await page.evaluate(() => {
      const inp = document.querySelector('#sales_order_create_customer_grid_filter_email');
      if (inp) {
        inp.value = 'pran.shirurkar@gmail.com';
        const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Search'));
        if (btn) btn.click();
      }
    });
    await new Promise(r => setTimeout(r, 3000));
    
    const result = await page.evaluate(() => {
      const rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
      for (const row of rows) {
        const email = row.querySelector('td:nth-child(3)')?.innerText?.trim();
        const name = row.querySelector('td:nth-child(2)')?.innerText?.trim();
        if (email === 'pran.shirurkar@gmail.com') {
          row.click();
          return { found: true, name, email };
        }
      }
      return { found: false, count: rows.length };
    });
    console.log('Customer result:', JSON.stringify(result));
    await new Promise(r => setTimeout(r, 3000));
    console.log('URL after customer:', page.url().substring(0, 150));
    
    // Now click Add Products
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button, a, span')].find(el => el.innerText.includes('Add Products'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 3000));
    
    // Check modal/popup
    const modal = await page.evaluate(() => {
      // Look for any popup/modal/dialog content
      const all = document.querySelectorAll('.modal-popup, .modal-inner-wrap, .ui-dialog, .product-grid');
      if (all.length === 0) return { modals: 0 };
      return {
        modals: all.length,
        text: [...all].map(m => m.innerText.substring(0, 200)).filter(Boolean)
      };
    });
    console.log('Modal state:', JSON.stringify(modal, null, 2));
  } else {
    // Not on order_create
    console.log('No customer grid, creating new order');
  }
}

await browser.disconnect();
