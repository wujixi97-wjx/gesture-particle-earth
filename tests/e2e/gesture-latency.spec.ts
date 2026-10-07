import { test, expect } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

test('delayed recognition rotates the actual globe and silence stops tracking', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    window.Worker = class {
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror = null
      count = 0
      stopped = false
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!String(url).includes('recognizer.worker.js')) return new NativeWorker(url, options) as unknown as this
      }
      postMessage(message: { type: string; timestamp: number; bitmap?: ImageBitmap }) {
        message.bitmap?.close()
        if (message.type === 'init') {
          setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 10)
          return
        }
        if (++this.count > 8) return // simulate a worker that stops producing results
        const x = .7 - this.count * .025
        const landmarks = Array.from({ length: 21 }, () => ({ x, y: .5, z: 0 }))
        landmarks[4] = { x: x - .06, y: .4, z: 0 }
        landmarks[8] = { x: x + .09, y: .4, z: 0 }
        landmarks[5] = { x: x - .1, y: .5, z: 0 }
        landmarks[17] = { x: x + .1, y: .5, z: 0 }
        setTimeout(() => {
          if (!this.stopped) this.onmessage?.({ data: { type: 'result', frame: {
            timestamp: message.timestamp, hands: [{ landmarks, worldLandmarks: landmarks,
              handedness: 'Left', gesture: 'Open_Palm', confidence: .99 }],
          } } })
        }, 400)
      }
      terminate() { this.stopped = true }
    } as unknown as typeof Worker
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?debug=true')
  await page.getByRole('button', { name: /ENABLE GESTURE CONTROL/ }).click()
  const debug = page.locator('#debug-panel')
  await expect(debug).toContainText(/ACTIVITY\s+ROTATING/)
  const yaw = async () => Number((await debug.textContent())?.match(/ROTATION\s+[-\d.]+, ([-\d.]+)/)?.[1])
  const initial = await yaw()
  await expect.poll(async () => (await yaw()) - initial, { timeout: 6000 }).toBeGreaterThan(.2)
  await page.screenshot({ path: 'artifacts/gesture-delayed-rotation.png' })
  await expect(debug).toContainText(/ACTIVITY\s+NO_HAND/, { timeout: 7000 })
  expect(errors).toEqual([])
})
