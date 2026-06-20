import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find(p => !p.url().includes('chrome://') && !p.url().includes('blank')) || pages[0];
console.log('Current URL:', page.url().substring(0, 150));

await page.goto('https://primesandzooms.com/notoms/admin/dashboard/index/key/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2000));
console.log('After navigate:', page.url().substring(0, 150));

// Check if we see the admin menu
const hasMenu = await page.evaluate(() => !!document.querySelector('.admin__menu'));
console.log('Has admin menu:', hasMenu);

// Check for login form
const username = await page.evaluate(() => !!document.querySelector('#username'));
console.log('Has login form:', username);

if (!hasMenu) {
  console.log('Need to re-login or navigate. Page shows:', (await page.evaluate(() => document.body.innerText.substring(0, 200))));
}

await browser.disconnect();
