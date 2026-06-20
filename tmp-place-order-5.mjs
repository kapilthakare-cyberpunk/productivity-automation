import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find(p => !p.url().includes('chrome://') && !p.url().includes('blank')) || pages[0];
console.log('URL:', page.url().substring(0, 150));

// Click Sales menu
await page.evaluate(() => {
  // Magento menu items use data attribute or class
  const menu = document.querySelector('.admin__menu');
  if (!menu) return 'no menu';
  const allItems = [...menu.querySelectorAll('li')];
  console.log('Menu items:', allItems.map(li => li.innerText.trim()));
  const sales = allItems.find(li => li.innerText.includes('Sales'));
  if (!sales) return 'no sales';
  // Click on the Sales parent menu item
  const link = sales.querySelector('a');
  if (link) link.click();
  return 'clicked sales';
});
await new Promise(r => setTimeout(r, 2000));

// Now click Orders submenu
await page.evaluate(() => {
  const orderLink = [...document.querySelectorAll('a, span')].find(el => el.innerText.trim() === 'Orders');
  if (orderLink) orderLink.click();
});
await new Promise(r => setTimeout(r, 4000));

const url = await page.url();
console.log('After Sales > Orders:', url.substring(0, 150));
const text = await page.evaluate(() => document.body.innerText.substring(0, 200));
const cf = text.includes('Cloudflare');
console.log('Cloudflare:', cf);
console.log('Text:', text);

if (!cf) {
  // Now click Create New Order
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Create New Order'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 4000));
  console.log('After create:', (await page.url()).substring(0, 150));
}

await browser.disconnect();
