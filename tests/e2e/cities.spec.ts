import { test, expect } from '@playwright/test'

test('city labels stay sparse and hide during explosion', async ({ page }) => {
  const mapRequests: string[] = []
  page.on('request', request => {
    if (/naturalearthdata\.com|raw\.githubusercontent\.com/.test(request.url())) mapRequests.push(request.url())
  })
  await page.goto('/')
  const layer = page.locator('.city-label-layer')
  await expect(layer).not.toHaveClass(/hidden/, { timeout: 6000 })
  const labels = page.locator('.city-label:not(.hidden)')
  expect(await labels.count()).toBeGreaterThan(0)
  expect(await labels.count()).toBeLessThanOrEqual(12)
  expect(mapRequests).toEqual([])

  const canvas = page.locator('canvas.webgl')
  await canvas.dblclick({ position: { x: 600, y: 400 } })
  await expect(layer).toHaveClass(/hidden/)
  await canvas.dblclick({ position: { x: 600, y: 400 } })
  await expect(layer).not.toHaveClass(/hidden/, { timeout: 4000 })
})

test('mobile labels do not cover HUD controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?debug=true')
  await expect(page.locator('.city-label-layer')).not.toHaveClass(/hidden/, { timeout: 6000 })
  const labels = page.locator('.city-label:not(.hidden)')
  expect(await labels.count()).toBeGreaterThan(0)
  expect(await labels.count()).toBeLessThanOrEqual(5)

  const controls = await Promise.all(['.topbar', '.center-copy', '.tracking', '.bottom-panel', '#debug-panel']
    .map(selector => page.locator(selector).boundingBox()))
  for (const label of await labels.all()) {
    const box = await label.boundingBox()
    if (!box) continue
    for (const control of controls) {
      if (!control) continue
      const overlap = box.x < control.x + control.width && box.x + box.width > control.x
        && box.y < control.y + control.height && box.y + box.height > control.y
      expect(overlap, `${await label.textContent()} overlaps a HUD region`).toBe(false)
    }
  }
  await page.screenshot({ path: 'artifacts/cities-mobile.png', fullPage: true })
})
