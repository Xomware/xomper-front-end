const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const fails = [];
  p.on('response', r => { if (r.status() >= 400) fails.push(`${r.status()} ${r.url().slice(0,110)}`); });
  p.on('pageerror', e => fails.push('JS: ' + e.message.slice(0,120)));
  await p.goto('https://xomper.xomware.com/login', { waitUntil:'networkidle', timeout:45000 });
  await p.waitForTimeout(2500);
  console.log('--- /login ---');
  console.log('  failures:', fails.length ? fails.slice(0,6) : 'none');
  fails.length = 0;
  await p.goto('https://xomper.xomware.com/search', { waitUntil:'networkidle', timeout:45000 });
  await p.waitForTimeout(3000);
  console.log('--- /search ---');
  console.log('  failures:', fails.length ? fails.slice(0,8) : 'none');
  await b.close();
})();
