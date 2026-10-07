import { test, expect } from '@playwright/test'

test('draws visible Earth pixels without runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(page.locator('.topbar .brand')).toBeVisible()
  await page.waitForTimeout(3300)
  await page.screenshot({ path: 'artifacts/earth-desktop.png', fullPage: true })
  const canvas = page.locator('canvas.webgl')
  await page.mouse.move(640, 360)
  await page.mouse.down(); await page.mouse.move(780, 400, { steps: 8 }); await page.mouse.up()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'artifacts/earth-rotated.png', fullPage: true })
  await canvas.hover()
  await page.mouse.wheel(0, -10000)
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'artifacts/earth-zoom-max.png', fullPage: true })
  await page.mouse.wheel(0, 20000)
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'artifacts/earth-zoom-min.png', fullPage: true })
  await canvas.dblclick({ position: { x: 640, y: 360 } })
  await page.waitForTimeout(1400)
  await page.screenshot({ path: 'artifacts/earth-exploded.png', fullPage: true })
  await canvas.dblclick({ position: { x: 640, y: 360 } })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: 'artifacts/earth-assembled.png', fullPage: true })
  expect(errors).toEqual([])
  await expect(page.locator('#error-banner')).toBeHidden()
})

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

test('initializes the local MediaPipe model with a camera stream', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?debug=true')
  await page.getByRole('button', { name: /ENABLE GESTURE CONTROL/ }).click()
  // Wait for readiness, allowing the tracker's 20s initialization window.
  await expect(page.locator('#tracking-status')).toHaveAttribute('data-status', 'active', { timeout: 30_000 })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: 'artifacts/earth-debug.png', fullPage: true })
  await expect(page.getByText('MOUSE / TOUCH ACTIVE')).toBeHidden()
  expect(errors).toEqual([])
})
