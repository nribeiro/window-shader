import { cp, mkdir, access, writeFile, rename } from "node:fs/promises";
await mkdir("public/wasm", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/wasm", {
  recursive: true,
});
await mkdir("public/models", { recursive: true });
const target = "public/models/hand_landmarker.task";
try {
  await access(target);
} catch {
  const url =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Model: HTTP ${response.status}`);
  await writeFile(
    `${target}.tmp`,
    new Uint8Array(await response.arrayBuffer()),
  );
  await rename(`${target}.tmp`, target);
}
console.log("WASM and model ready for local processing.");
