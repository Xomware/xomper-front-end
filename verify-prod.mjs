import { chromium } from '@playwright/test'
const BASE = 'https://xomper.xomware.com'
const EMAIL = `xomper-prod-${Date.now()}@mailinator.com`
const PASS = 'GoodPass123'
const step = (n, ok, d = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`)

const browser = await chromium.launch()
const page = await browser.newContext().then(c => c.newPage())
const api = []
page.on('response', r => { if (r.url().includes('execute-api')) api.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`) })

await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
step('guarded route redirects signed-out visitor', page.url().includes('/login'), page.url())

await page.getByRole('button', { name: /Sign in with Email/i }).click()
await page.waitForTimeout(400)
await page.getByText('Sign up', { exact: true }).click()
await page.waitForTimeout(400)
await page.locator('#email-input').fill(EMAIL)
await page.locator('#password-input').fill(PASS)
await page.locator('#confirm-password-input').fill(PASS)
await page.getByRole('button', { name: /^Sign Up$/ }).click()
await page.waitForTimeout(8000)
step('sign-up reaches verify', (await page.locator('body').innerText()).includes('Confirm your email'))
console.log('EMAIL=' + EMAIL)
await browser.close()
