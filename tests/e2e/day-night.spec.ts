import { test, expect } from '@playwright/test'

test('day and night remain readable through rotation and zoom without shader errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(page.locator('.city-label-layer')).not.toHaveClass(/hidden/, { timeout: 6000 })
  await page.screenshot({ path: 'artifacts/day-night-desktop.png' })
  await page.mouse.move(600, 350)
  await page.mouse.down(); await page.mouse.move(900, 420, { steps: 12 }); await page.mouse.up()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'artifacts/day-night-rotated.png' })
  await page.mouse.wheel(0, -10000)
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'artifacts/day-night-zoom.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.city-label-layer')).not.toHaveClass(/hidden/, { timeout: 6000 })
  await page.screenshot({ path: 'artifacts/day-night-mobile.png' })
  expect(errors).toEqual([])
})
