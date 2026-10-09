/// <reference lib="webworker" />
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
let tracker: HandLandmarker | null = null;
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  try {
    if (data.type === "init") {
      const files = await FilesetResolver.forVisionTasks(data.wasm, true);
      tracker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.model, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame") {
      const bitmap: ImageBitmap = data.bitmap;
      try {
        if (!tracker) return;
        const result = tracker.detectForVideo(bitmap, data.time);
        const hands = result.landmarks.map((points, i) => ({
          wrist: points[0],
          index: points[8],
          thumb: points[4],
          label: result.handedness[i]?.[0]?.categoryName ?? "",
          score: result.handedness[i]?.[0]?.score ?? 0,
        }));
        self.postMessage({ type: "result", hands, time: data.time });
      } finally {
        bitmap.close();
      }
    } else if (data.type === "dispose") {
      tracker?.close();
      tracker = null;
      self.postMessage({ type: "closed" });
      self.close();
    }
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) });
  }
};
