import { chromium } from '@playwright/test'
const BASE = 'https://xomper.xomware.com'
const EMAIL = 'xomper-prod-1787783455818@mailinator.com'
const PASS = 'GoodPass123'
const step = (n, ok, d = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`)

const browser = await chromium.launch()
const page = await browser.newContext().then(c => c.newPage())
const api = []
page.on('response', r => { if (r.url().includes('execute-api')) api.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /Sign in with Email/i }).click()
await page.waitForTimeout(400)
await page.locator('#email-input').fill(EMAIL)
await page.locator('#password-input').fill(PASS)
await page.getByRole('button', { name: /^Sign In$/ }).click()
await page.waitForTimeout(10000)

step('unlinked account is routed to /link-sleeper', page.url().includes('/link-sleeper'), page.url())
step('GET /me/profile returned 200', api.some(c => c.startsWith('200 GET') && c.includes('/me/profile')), api.join('; '))

// Link a real Sleeper handle through the UI
const input = page.locator('input').first()
await input.fill('domgiordano')
await page.keyboard.press('Enter')
await page.waitForTimeout(6000)
const btn = page.getByRole('button', { name: /confirm|link|yes/i }).first()
if (await btn.count()) { await btn.click(); await page.waitForTimeout(10000) }
step('PUT /me/sleeper-link returned 200', api.some(c => c.startsWith('200 PUT') && c.includes('sleeper-link')), api.filter(c=>c.includes('sleeper')).join('; ') || 'none')
step('linking leaves the link page', !page.url().includes('/link-sleeper'), page.url())

// The refresh path that used to empty the app
await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
await page.waitForTimeout(10000)
step('refresh stays signed in and inside the app',
  !page.url().includes('/login') && !page.url().includes('/link-sleeper'), page.url())
const t = await page.locator('body').innerText()
step('home renders content after refresh', t.length > 300, `${t.length} chars`)

// Sign out lives in the profile dropdown
const hasSignOut = /sign out|log ?out/i.test(t)
step('sign-out reachable', hasSignOut || await page.getByText(/sign out/i).count() > 0)

console.log('\nAPI:', api.join('\n     '))
await browser.close()
