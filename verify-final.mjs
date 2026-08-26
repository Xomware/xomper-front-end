import { chromium } from '@playwright/test'
const BASE='https://xomper.xomware.com'
const step=(n,ok,d='')=>console.log(`${ok?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`)
const b=await chromium.launch(); const page=await b.newContext().then(c=>c.newPage())
const api=[],errs=[]
page.on('response',r=>{if(r.url().includes('execute-api'))api.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)})
page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120))})

await page.goto(`${BASE}/login`,{waitUntil:'networkidle'}); await page.waitForTimeout(2500)
await page.getByRole('button',{name:/Sign in with Email/i}).click(); await page.waitForTimeout(400)
await page.locator('#email-input').fill('xomper-prod-1787783455818@mailinator.com')
await page.locator('#password-input').fill('GoodPass123')
await page.getByRole('button',{name:/^Sign In$/}).click(); await page.waitForTimeout(12000)
step('linked user goes straight into the app', !page.url().includes('/login') && !page.url().includes('/link-sleeper'), page.url())

await page.goto(`${BASE}/home`,{waitUntil:'networkidle'}); await page.waitForTimeout(10000)
step('refresh keeps the session', !page.url().includes('/login'), page.url())
const txt = await page.locator('body').innerText()
step('no dead CLT tabs in nav', !/World Cup|Taxi Squad/i.test(txt))

// sign-out through the profile dropdown
const trigger = page.locator('.profile-trigger, [class*="profile"]').first()
if (await trigger.count()) { await trigger.click(); await page.waitForTimeout(900) }
const signOut = page.getByText(/sign out/i).first()
step('sign out is in the profile dropdown', await signOut.count() > 0)
if (await signOut.count()) {
  await signOut.click(); await page.waitForTimeout(6000)
  step('sign out ends the session', page.url().includes('/login') || page.url() === BASE + '/' , page.url())
}

const bad = api.filter(c => !c.startsWith('2'))
step('no failing API calls', bad.length === 0, bad.join('; ') || 'all 2xx')
console.log('\nAPI:', api.join('\n     '))
console.log('console errors:', errs.length ? errs.slice(0,4) : 'none')
await b.close()
