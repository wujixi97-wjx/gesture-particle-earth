import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision'
import type { HandFrame, TrackedHand } from './types'

let recognizer: GestureRecognizer | null = null
self.onmessage = async (event: MessageEvent<{ type: string; base?: string; bitmap?: ImageBitmap; timestamp?: number }>) => {
  const data = event.data
  if (data.type === 'init' && data.base) {
    try {
      const wasm = await FilesetResolver.forVisionTasks(`${data.base}mediapipe/wasm`, false)
      recognizer = await GestureRecognizer.createFromOptions(wasm, {
        baseOptions: { modelAssetPath: `${data.base}mediapipe/gesture_recognizer.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.5,
      })
      self.postMessage({ type: 'ready' })
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }) }
  }
  if (data.type === 'frame' && data.bitmap && data.timestamp) {
    try {
      if (!recognizer) throw new Error('Recognizer is not ready')
      const result = recognizer.recognizeForVideo(data.bitmap, data.timestamp)
      const hands: TrackedHand[] = result.landmarks.map((landmarks, index) => ({
        landmarks: landmarks.map(p => ({ x: p.x, y: p.y, z: p.z })),
        worldLandmarks: (result.worldLandmarks[index] || []).map(p => ({ x: p.x, y: p.y, z: p.z })),
        handedness: (result.handedness[index]?.[0]?.categoryName || 'Unknown') as TrackedHand['handedness'],
        gesture: result.gestures[index]?.[0]?.categoryName || 'None',
        confidence: result.gestures[index]?.[0]?.score || 0,
      }))
      const frame: HandFrame = { timestamp: data.timestamp, hands }
      self.postMessage({ type: 'result', frame })
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }) }
    finally { data.bitmap.close() }
  }
}
