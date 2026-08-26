import { chromium } from '@playwright/test'
const b = await chromium.launch(); const p = await b.newContext().then(c=>c.newPage())
await p.goto('https://xomper.xomware.com/login',{waitUntil:'networkidle'}); await p.waitForTimeout(2500)
await p.getByRole('button',{name:/Sign in with Email/i}).click(); await p.waitForTimeout(400)
await p.locator('#email-input').fill('xomper-prod-1787783455818@mailinator.com')
await p.locator('#password-input').fill('GoodPass123')
await p.getByRole('button',{name:/^Sign In$/}).click(); await p.waitForTimeout(10000)
const t = await p.evaluate(()=>{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.endsWith('.idToken'))return localStorage.getItem(k)}return null})
console.log(t ?? 'NO_TOKEN'); await b.close()
