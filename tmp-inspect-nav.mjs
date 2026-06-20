import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
let page = pages[0];
if (!page) page = await browser.newPage();

// Go to dashboard
await page.goto('https://primesandzooms.com/notoms/admin/', {
  waitUntil: 'networkidle0',
  timeout: 90000,
});
await new Promise(r => setTimeout(r, 2000));

console.log('URL:', page.url());

// Inspect the sidebar menu structure
const menuHtml = await page.evaluate(() => {
  const items = document.querySelectorAll('[data-ui-id^="menu-"]');
  return [...items].slice(0, 30).map(el => ({
    text: el.innerText?.trim()?.substring(0, 80),
    id: el.id,
    class: el.className?.substring(0, 60),
    href: el.tagName === 'A' ? el.href : (el.querySelector('a')?.href || ''),
  }));
});
console.log('Menu items:', JSON.stringify(menuHtml, null, 2));

// Also check the page body for menu structure
const menuStructure = await page.evaluate(() => {
  const nav = document.querySelector('.admin__menu');
  if (!nav) return 'No .admin__menu found';
  const items = nav.querySelectorAll('li');
  return [...items].map(li => ({
    text: li.innerText?.trim()?.substring(0, 100),
    class: li.className?.substring(0, 50),
    link: li.querySelector('a')?.href || '',
    id: li.id,
  }));
});
console.log('Menu structure:', JSON.stringify(menuStructure, null, 2));

await browser.disconnect();
