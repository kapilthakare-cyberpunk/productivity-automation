import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find(p => !p.url().includes('chrome://') && !p.url().includes('blank')) || pages[0];

// Investigate menu structure
const menuHtml = await page.evaluate(() => {
  const menu = document.querySelector('.admin__menu');
  return [...menu.querySelectorAll('li')].map(li => {
    const link = li.querySelector('a');
    const sub = li.querySelector('ul');
    return {
      text: li.innerText.trim().split('\n')[0],
      href: link?.href,
      hasSubmenu: !!sub,
      subitems: sub ? [...sub.querySelectorAll('a')].map(a => ({ text: a.innerText.trim(), href: a.href })) : []
    };
  });
});
console.log('Menu structure:');
console.log(JSON.stringify(menuHtml, null, 2));

// Get the current key from URL
const keyMatch = page.url().match(/key\/([a-f0-9]+)/);
const key = keyMatch ? keyMatch[1] : null;
console.log('Current key:', key);

await browser.disconnect();
