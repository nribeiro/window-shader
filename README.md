# Window Shader

A standalone React, TypeScript and Vite application. The index fingertips and thumb tips of both hands define a polygonal window over the mirrored camera feed. The shader transforms only the image inside that window; the area outside retains the original video.

Includes **11 shaders**, mouse/touch simulation, fullscreen mode and local recording with a preference for **MP4/H.264**. No audio, accounts, application server or video uploads to external services.

## Installation and setup

Declared requirement: **Node >=22.18.0**. The implementation environment used Node **24.18.0** and npm **12.1.0**. Main dependency versions are pinned in `package.json`, with resolved versions in `package-lock.json`: React 19.3.0, Vite 8.3.1, Three.js 0.186.1, MediaPipe Tasks Vision 1.0.1 and TypeScript 7.0.2.

From the directory that contains the project:

```sh
cd janela-shader
npm ci
npm run dev
```

Open the localhost address reported by Vite. Installation copies the WASM files from the MediaPipe package and downloads the official Hand Landmarker model, version float16/1, to `public/`. Network access is required at this stage. If installation scripts are disabled, run `npm run assets`.

To build and preview the production version:

```sh
npm run build
npm run preview -- --port 5179 --strictPort
```

The preview is available at [http://127.0.0.1:5179/](http://127.0.0.1:5179/) while the command is active. After a rebuild, refresh the page to load the new version.

The build output is `dist/`, ready for static HTTPS hosting. Application assets, including the model and WASM, are served from the same origin; the interface uses system fonts. There are no analytics requests or frame uploads. Do not open `index.html` through `file://`.

The camera requires **localhost or HTTPS** and user permission. The development server listens only on `127.0.0.1`; tests on another device require appropriate network access and HTTPS configuration.

## Controls

The application interface and its accessibility labels are in English.

| Control | Behaviour |
| --- | --- |
| Start / Start camera | Requests video access only, never microphone access. |
| Stop camera | Stops the video stream and hand tracking, releases GPU resources and ends any active recording. |
| Hands | Uses the index fingers and thumbs of both hands to define the window. |
| Simulation | Lets you drag the four vertices with a mouse or touch. Without a camera, it displays a locally generated test image. |
| Effect dropdown over the video | Selects the shader; the selection stays in sync with the sidebar list. |
| Intensity | Ranges from 0% (original video) to 100%. Does not change vertex positions. |
| Outline and vertices | Shows or hides the visual guide without disabling the effect. |
| Reset vertices | Restores the initial window in simulation mode. |
| Fullscreen | Expands the video area; exit with the button or Esc. |
| Record / Stop recording | Starts or stops a local recording of the video with the shader. |
| Download MP4 / WEBM | Saves the latest recording in the indicated format. |

In simulation mode, the arrow keys move a focused vertex in 1% steps. Keep the outline visible to drag the points. In Hands mode, keep both hands well lit, visible and separate: **“Spread your index fingers and thumbs to create the window.”**

The interface reports model status, hand count and errors related to permissions, the camera, geometry, WebGL, fullscreen or recording. If the model fails, you can retry the load or continue in simulation mode.

## Available shaders

All effects share the same mask and intensity control. Their identifiers correspond to `uEffect`.

| ID | Shader | Result |
| --- | --- | --- |
| 0 | Psychedelic | Posterisation, a vibrant palette, outlines and subtle animated distortion. |
| 1 | Pixelation | Divides the image into blocks of colour. |
| 2 | Distortion | Waves that displace the processed video sample. |
| 3 | Terminator | Red vision, contrast, a crosshair and a scan effect. |
| 4 | Thermal | A brightness-based colour palette; does not measure temperature. |
| 5 | Neon | Bright, colourful outlines on a dark background. |
| 6 | Negative | Inverts the RGB colours. |
| 7 | Minecraft | Blocks, an earth/vegetation/stone palette, texture and raised edges. |
| 8 | Halftone dots | CMYK colour print with separate screen angles and larger dots in cells of 14 CSS pixels. |
| 9 | Ordered dithering | A 4×4 Bayer pattern and RGB quantisation for a retro appearance. |
| 10 | Glitch | Analogue/CRT signal: strong RGB separation, displaced bands, localised waves, ghost images, scanlines and fine noise. |

The current Glitch effect distorts the image itself, inspired by the analogue signal reference. The crosses, frames and graphic block overlays from the previous version have been removed.

## Fullscreen and recording

The buttons sit at the bottom of the video area and remain accessible in fullscreen mode. If an embedded browser blocks fullscreen, open the application in a compatible browser.

Recording works with both the camera and simulation. It captures **the mirrored video with the shader**, without audio, controls or SVG markers. During capture, the interface displays the duration and format.

1. Click **Record** with an active video source.
2. Adjust the effect or window during the recording.
3. Click **Stop recording** and wait for the file to be prepared.
4. Use **Download MP4** or **Download WEBM**.

The application prefers MP4/H.264, then browser-supported MP4, with WebM as a fallback. The container and extension match the actual output format: a WebM file is never simply renamed to MP4.

Capture runs at up to 30 fps and retains its initial resolution, capped at 1920×1080. If the visible area's aspect ratio changes, the recorded image retains its proportions with black borders. A dedicated canvas receives the output immediately after each WebGL render to prevent blank frames in the production build.

If you stop the camera or replace the source, the recording ends and the file becomes available. The video stays in memory: download it before you start another recording or close/reload the page. A new recording replaces the previous one; long recordings consume memory. There are no uploads to external services or automatic permanent storage.

## Processing and coordinates

1. `getUserMedia` feeds a single `video` element, without CSS mirroring.
2. `VideoTexture` references that video: one instance per scene lifecycle, linear filters, disabled mipmaps and no texture copy on each frame.
3. A `PlaneGeometry(2, 2)` fills the orthographic camera view. A single `ShaderMaterial` computes the original video, processed version and mask. There is no second video plane/texture or mesh between the fingers.
4. The shader receives UV coordinates with their origin at the bottom left. `uCrop` describes a centred `cover` crop that preserves the aspect ratio. `sampleVideo` applies this crop and **exactly one horizontal flip** to the video sample. The original and processed images use the same transformation.
5. MediaPipe's 2D landmarks have their origin at the top left. `landmarkToUV` flips x (mirror) and y (origin) once, then applies the inverse crop transform. `pointerToUV` already uses the visible area and only flips y. A video area resize recalculates the crop and reprojects the original landmarks.
6. The order is always **index A → index B → thumb B → thumb A** (landmarks 8 and 4). Hand matching uses wrist position continuity and each hand's left/right classification. The detector's result order does not define identity, and vertices are not sorted by angle to hide errors.
7. Non-finite coordinates, areas below 0.003 of the UV domain, concavity, degeneracy and intersections are rejected. Validation takes place before and after smoothing. Two consecutive valid results are required to display hand tracking; results older than 250 ms no longer sustain the effect.

### Shader composition

Main uniforms in `src/shaders.ts` and `src/engine.ts`:

| Uniform | Purpose |
| --- | --- |
| `uVideo` | The single `VideoTexture` |
| `uResolution` | Actual render buffer dimensions |
| `uCrop` | Centred crop that preserves the aspect ratio |
| `uPolygon` | Four valid UV vertices with stable correspondence |
| `uPolygonValid` | A value of zero forces the mask to zero |
| `uMaskFeather` | A 2 CSS pixel transition converted to buffer pixels |
| `uVisibility` | Fade as the window appears or disappears |
| `uIntensity` | Selected intensity, from 0 to 1 |
| `uEffect` | Shader ID, from 0 to 10; see the shader table |
| `uTime` | Animation time in seconds |
| `uPixelSize` | Block size in buffer pixels |
| `uDistortion` | Distortion amplitude in UV coordinates |

The mask uses consistent cross-product signs and the distance to the nearest edge segment in pixels. `smoothstep` softens the edge **inwards only**: there is no effect band or halo outside. A change of effect only changes `effectedColor`.

```glsl
originalColor = sampleVideo(vUv);
blendAmount = mask * clamp(uIntensity, 0.0, 1.0) * uVisibility;
finalColor = mix(originalColor, effectedColor, blendAmount);
```

When `uIntensity == 0`, or outside the window, the shader explicitly returns `originalColor`. No additional colour correction, tone mapping or double sRGB conversion is applied to that sample. Points retain their positions at zero intensity. The SVG guide is independent; hide it to compare the entire image without markers.

When an observation becomes invalid, its points are never sent to the shader: the last valid geometry is retained as `uVisibility` decreases, with a 90 ms time constant. `uPolygonValid` continues to describe that stored geometry, rather than the validity of the new detection. It becomes zero once the fade ends. This avoids a filled, self-intersecting shape or an abrupt loss of the effect.

### Performance and resources

The render loop uses `requestAnimationFrame`; inference runs in a **Web Worker** at up to 20 Hz, with fresh frames reduced to 640 pixels wide. Only one inference can be pending; transferred `ImageBitmap` objects are closed. The model uses CPU/WASM in the worker to keep the interface responsive. It does not use z coordinates or 3D hand geometry.

Uniforms and the SVG overlay update directly; React only receives state changes, with no React render on each frame. Smoothing adapts to speed and uses elapsed time. GPU resolution is capped at DPR 2. Control changes do not recreate the texture, material or geometry.

When the application stops or unmounts, loops, timers, video tracks and observers are cancelled; the model and worker are shut down, and the texture, material, geometry and renderer are released. A generation identifier invalidates old camera requests, even if permission arrives after cancellation.

## Validation

```sh
npm test
npm run test:browser
npm run build
```

The test suite contains **6 unit tests and 11 browser tests**. Browser tests use Playwright with **Google Chrome installed**, a synthetic camera and simulated permission. They do not activate the physical camera. On another system, install Chrome or adjust `channel` in `playwright.config.ts`. Screenshots are saved to `test-results/`.

Unit tests cover convexity, intersections, degeneracy, minimum area, non-finite coordinates, UV conversions with crop and resize, mouse input, hand identity, low confidence, smoothing and fades. Browser tests verify the WebGL shader through pixel readback, inside/outside behaviour, zero intensity across all eleven effects, vertex drag, invalid windows, recovery, resize and small-screen layout, model loading, video stream stop/restart, denied permission, cancellation of pending requests, model load failure/retry and unavailable WebGL. Scripted hand observations check loss, recovery, invalid geometry and vertex stability without a claim to validate real hand detection.

Tests also cover fullscreen mode, recording with resize, file playback/download, MP4 container verification, the WebM fallback and messages for unavailable APIs.

To verify recording in the production build:

```sh
npm run build
JANELA_TEST_PREVIEW=1 npm run test:browser -- --grep "fullscreen, MP4|WebM fallback"
```

Tests use port 5178. Stop any previous development server on that port before a production test to avoid reuse of the wrong instance. Screenshots in `test-results/` are temporary and may be replaced by subsequent runs.

During implementation, the application was built, synthetic video tests were run and screenshots were inspected. This does not constitute validation with a real camera or guarantee hand tracking quality in real conditions. A README-only change does not imply a new test run.

### Manual simulation test

1. Choose **Try simulation**; the test image lets you start without camera permission.
2. Drag the vertices. Background lines and colours should stay fixed outside the window; the video must not stretch between the points.
3. Switch between all eleven effects. The outline should stay unchanged.
4. Set intensity to **0%** and hide the outline. The entire image should match the original.
5. Cross the edges or create a concave shape. The outline should indicate an invalid shape and the effect should fade out. Use **Reset vertices** to recover.
6. Resize the window and repeat the steps. Enable the camera in simulation mode to check the effect on real video.
7. Enter and exit fullscreen; check point alignment and the effect selector.
8. Record a few seconds, change the effect and resize the window. Stop and download the video; check playback, the effect and the absence of audio and controls.
9. In **Hands** mode, confirm that the four points follow the correct fingertips, including as you move your hands closer together or further apart. Remove one hand, restore it, then stop/restart the camera.

## Known limitations

- Real hand tracking under occlusion, crossed gestures and changes in light requires manual validation with a physical camera. Synthetic video tests do not establish this quality.
- Position continuity and hand classification reduce identity swaps but cannot guarantee identity during long occlusions. After 1.2 seconds without a valid pair, identity is reacquired; finger order is never changed to force a valid shape.
- Only convex 2D quadrilaterals are supported; fingertips that are too close, overlapping hands and crossed gestures are deliberately rejected.
- Hands mode requires WebAssembly, Web Workers and `createImageBitmap`; video with a shader requires WebGL2. Simulation without a camera requires `canvas.captureStream`.
- Chrome is the reference browser for automated tests. Safari, Firefox, mobile devices and low-performance GPUs require additional tests.
- The distributed model/WASM files total approximately 42 MB; the browser only loads the variant it uses. The first load may take some time.
- Shaders interpret the visual references rather than reproduce them exactly. Their appearance depends on the video, light and selected intensity.
- Fullscreen and recording depend on the APIs allowed by the browser. MP4 is not supported in every browser; WebM is used in those cases.

## Project structure

| File | Responsibility |
| --- | --- |
| `src/App.tsx` / `src/styles.css` | Interface, controls and responsive styles. |
| `src/engine.ts` | Camera, Three.js scene, loops, uniforms, overlay and resource cleanup. |
| `src/shaders.ts` | Mask and implementation of all eleven effects. |
| `src/geometry.ts` | Validation, UV conversions, smoothing and fades. |
| `src/tracking.ts` | Hand identity and vertex correspondence. |
| `src/hand.worker.ts` | MediaPipe inference outside the UI thread. |
| `src/recording.ts` | Capture, format selection, finalisation and local URLs. |
| `scripts/prepare-assets.mjs` | Preparation of local WASM files and the model. |
| `tests/` | Unit and browser tests. |

The Vite cache is separate for each user (`.vite-cache-<uid>`) to avoid permission conflicts between servers started by different users.

## Reference documentation

- [Vite](https://vite.dev/guide/)
- [MediaPipe Hand Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Three.js VideoTexture](https://threejs.org/docs/pages/VideoTexture.html)
- [Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)
- [MediaRecorder and supported formats](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)
