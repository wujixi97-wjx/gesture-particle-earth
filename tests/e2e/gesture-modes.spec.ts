import { test, expect } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

test('camera disables idle tour; finger spacing zooms, stable palm exits and worker errors fall back', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const control = { ratio: .75, gesture: 'Open_Palm', hand: true, fail: false, x: .5 }
    Object.assign(window, { testHand: control })
    const NativeWorker = window.Worker
    window.Worker = class {
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror: ((event: { message: string }) => void) | null = null
      stopped = false
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!String(url).includes('recognizer.worker.js')) return new NativeWorker(url, options) as unknown as this
      }
      postMessage(message: { type: string; timestamp: number; bitmap?: ImageBitmap }) {
        message.bitmap?.close()
        setTimeout(() => {
          if (this.stopped) return
          if (message.type === 'init') { this.onmessage?.({ data: { type: 'ready' } }); return }
          if (control.fail) { this.onerror?.({ message: 'simulated worker failure' }); return }
          const { x, ratio, gesture, hand } = control
          const landmarks = Array.from({ length: 21 }, () => ({ x, y: .5, z: 0 }))
          landmarks[5] = { x: x - .1, y: .5, z: 0 }
          landmarks[17] = { x: x + .1, y: .5, z: 0 }
          landmarks[4] = { x, y: .4, z: 0 }
          landmarks[8] = { x: x + ratio * .2, y: .4, z: 0 }
          this.onmessage?.({ data: { type: 'result', frame: { timestamp: message.timestamp,
            hands: hand ? [{ landmarks, worldLandmarks: landmarks, handedness: 'Left', gesture, confidence: .99 }] : [] } } })
        }, 80)
      }
      terminate() { this.stopped = true }
    } as unknown as typeof Worker
  })
  await page.goto('/?debug=true')
  await page.locator('#enable-camera').click()
  const debug = page.locator('#debug-panel')
  await expect(debug).toContainText(/ACTIVITY\s+ROTATING/)
  await page.locator('.city-label:not(.hidden)').first().click({ force: true })
  await expect(page.locator('body')).toHaveAttribute('data-focusing', 'false')
  await page.locator('#close-city').click()
  const control = async (patch: Record<string, unknown>) => page.evaluate(value => Object.assign((window as unknown as { testHand: object }).testHand, value), patch)
  const scale = () => page.evaluate(async () => {
    // Read the actual globe scale from diagnostics, not just a controller intent.
    return Number(document.querySelector('#debug-panel')!.textContent!.match(/SCALE\s+([\d.]+)/)?.[1])
  })
  await control({ ratio: .2, gesture: 'None' })
  await expect(debug).toContainText(/ACTIVITY\s+ZOOMING/)
  const initial = await scale()
  await control({ ratio: .7 })
  await expect.poll(scale).toBeGreaterThan(initial + .25)
  const enlarged = await scale()
  await control({ ratio: .15 })
  await expect.poll(scale).toBeLessThan(enlarged - .15)
  await control({ hand: false })
  await expect(debug).toContainText(/ACTIVITY\s+NO_HAND/)
  await control({ hand: true, ratio: .7 })
  await expect(debug).toContainText(/ACTIVITY\s+ZOOMING/)
  await control({ gesture: 'Open_Palm' })
  await expect(debug).toContainText(/ACTIVITY\s+ROTATING/)
  await control({ hand: false })
  await expect(debug).toContainText(/ACTIVITY\s+NO_HAND/)
  await page.waitForTimeout(16000)
  await expect(page.locator('body')).toHaveAttribute('data-cruising', 'false')
  await control({ fail: true })
  await expect(page.locator('#tracking-status')).toHaveAttribute('data-status', 'fallback')
  await expect(page.locator('#error-banner')).toContainText('simulated worker failure')
  await expect(debug).toContainText(/ACTIVITY\s+NO_HAND/)
  expect(errors).toEqual([])
})
