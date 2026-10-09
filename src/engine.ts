import * as THREE from "three";
import { VideoRecording, type RecordingState } from "./recording";
import {
  coverScale,
  fade,
  initialQuad,
  landmarkToUV,
  smoothQuad,
  validQuad,
} from "./geometry";
import type { Point, Quad } from "./geometry";
import { HandIdentity, handQuad } from "./tracking";
import type { Hand } from "./tracking";
import { vertexShader, fragmentShader } from "./shaders";
export type Mode = "hands" | "simulation";
export type Status = {
  camera: "off" | "requesting" | "on";
  model: "idle" | "loading" | "ready" | "error";
  hands: number;
  source: "none" | "camera" | "test";
  geometry: "waiting" | "valid" | "invalid";
  error: string;
};
export class WindowEngine {
  status: Status = {
    camera: "off",
    model: "idle",
    hands: 0,
    source: "none",
    geometry: "waiting",
    error: "",
  };
  mode: Mode = "hands";
  manual = initialQuad();
  effect = 0;
  intensity = 0.85;
  outline = true;
  private recording: VideoRecording;
  private video = document.createElement("video");
  private stream: MediaStream | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private texture: THREE.VideoTexture | null = null;
  private geometry: THREE.PlaneGeometry | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private worker: Worker | null = null;
  private resizeObserver: ResizeObserver;
  private identity = new HandIdentity();
  private crop: Point = { x: 1, y: 1 };
  private raw: Quad | null = null;
  private lastGood: Quad = initialQuad();
  private smoothed: Quad | null = null;
  private visibility = 0;
  private lastFrame = 0;
  private lastResult = 0;
  private validFrames = 0;
  private raf = 0;
  private inferenceTimer = 0;
  private modelTimer = 0;
  private busy = false;
  private busySince = 0;
  private lastVideoTime = -1;
  private testTimer = 0;
  private epoch = 0;
  private destroyed = false;
  constructor(
    private host: HTMLDivElement,
    private svg: SVGSVGElement,
    private onStatus: (s: Status) => void,
    onRecording: (s: RecordingState) => void,
  ) {
    this.recording = new VideoRecording(onRecording);
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.addEventListener("resize", this.videoResize);
    this.camera.position.z = 1;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }
  private emit(patch: Partial<Status>) {
    if (this.destroyed) return;
    if (
      Object.entries(patch).every(
        ([key, value]) => this.status[key as keyof Status] === value,
      )
    )
      return;
    this.status = { ...this.status, ...patch };
    this.onStatus({ ...this.status });
  }
  private videoResize = () => this.resize();
  private resize() {
    if (!this.renderer || !this.material) return;
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(
      this.material.uniforms.uResolution.value,
    );
    this.crop = coverScale(
      this.video.videoWidth || 1280,
      this.video.videoHeight || 720,
      width,
      height,
    );
    this.material.uniforms.uCrop.value.set(this.crop.x, this.crop.y);
    this.material.uniforms.uMaskFeather.value =
      2 * this.renderer.getPixelRatio();
    // Reproject raw source coordinates immediately on resize, not old screen UVs.
    this.smoothed = null;
  }
  private createScene() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        preserveDrawingBuffer: import.meta.env.DEV,
      });
    } catch {
      throw new Error(
        "WebGL is unavailable. Enable graphics acceleration or try another browser.",
      );
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Mirrored video with an effect inside the window",
    );
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.host.prepend(this.renderer.domElement);
    this.texture = new THREE.VideoTexture(this.video);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uVideo: { value: this.texture },
        uResolution: { value: new THREE.Vector2() },
        uCrop: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uIntensity: { value: this.intensity },
        uEffect: { value: this.effect },
        uPolygon: {
          value: initialQuad().map((p) => new THREE.Vector2(p.x, p.y)),
        },
        uPolygonValid: { value: 0 },
        uVisibility: { value: 0 },
        uMaskFeather: { value: 2 },
        uPixelSize: { value: 18 },
        uDistortion: { value: 0.025 },
      },
    });
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
    this.resize();
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.render);
  }
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.stop();
    this.emit({
      error:
        "The GPU connection was interrupted. Start again to restore the video.",
    });
  };
  async startCamera() {
    if (this.status.camera === "requesting" || this.status.camera === "on")
      return;
    this.release();
    const token = ++this.epoch;
    this.emit({
      camera: "requesting",
      source: "none",
      error: "",
      geometry: "waiting",
    });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("The camera requires localhost or an HTTPS connection.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (token !== this.epoch || this.destroyed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      if (token !== this.epoch || this.destroyed) return;
      this.createScene();
      stream.getVideoTracks()[0].addEventListener(
        "ended",
        () => {
          if (token === this.epoch) {
            this.stop();
            this.emit({
              error: "The camera was disconnected. Reconnect it and start again.",
            });
          }
        },
        { once: true },
      );
      this.emit({ camera: "on", source: "camera" });
      if (this.mode === "hands") this.startTracking();
    } catch (error) {
      if (token !== this.epoch || this.destroyed) return;
      this.release();
      const name = error instanceof DOMException ? error.name : "";
      const message =
        name === "NotAllowedError"
          ? "Permission denied. Allow camera access in your browser settings and try again."
          : name === "NotFoundError"
            ? "No camera found. Connect a camera or use simulation mode."
            : name === "NotReadableError"
              ? "The camera is unavailable or in use by another application."
              : error instanceof Error
                ? error.message
                : "Could not start the camera.";
      this.emit({ camera: "off", source: "none", error: message });
    }
  }
  async setMode(mode: Mode) {
    this.mode = mode;
    this.raw = null;
    this.smoothed = null;
    this.validFrames = 0;
    this.visibility = 0;
    this.emit({ geometry: "waiting", error: "" });
    if (mode === "simulation") {
      this.stopTracking();
      if (this.status.camera === "off" && this.status.source === "none")
        await this.startTest();
    } else {
      if (this.status.source === "test") this.stop();
      if (this.status.camera === "on") this.startTracking();
    }
  }
  private async startTest() {
    this.release();
    const token = ++this.epoch;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        const g = ctx.createLinearGradient(0, 0, 1280, 720);
        g.addColorStop(0, "#1e3f4a");
        g.addColorStop(0.5, "#727974");
        g.addColorStop(1, "#cfaf83");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 1280, 720);
        for (let y = 0; y < 9; y++)
          for (let x = 0; x < 16; x++) {
            ctx.fillStyle = (x + y) % 2 ? "#ffffff10" : "#00000010";
            ctx.fillRect(x * 80, y * 80, 80, 80);
          }
        ctx.strokeStyle = "#ffffff28";
        ctx.lineWidth = 1;
        for (let x = 0; x <= 1280; x += 80) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 720);
          ctx.stroke();
        }
        for (let y = 0; y <= 720; y += 80) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(1280, y);
          ctx.stroke();
        }
        [
          "#ee705b",
          "#e9bd56",
          "#a4c973",
          "#64afa5",
          "#689dc5",
          "#a891be",
        ].forEach((color, i) => {
          ctx.fillStyle = color;
          ctx.fillRect(80 + i * 190, 565, 155, 70);
        });
      };
      draw();
      this.testTimer = window.setInterval(draw, 100);
      this.stream = canvas.captureStream(10);
      this.video.srcObject = this.stream;
      await this.video.play();
      if (token !== this.epoch || this.destroyed) return;
      this.createScene();
      this.emit({ source: "test", error: "" });
    } catch (error) {
      if (token !== this.epoch || this.destroyed) return;
      this.release();
      this.emit({
        source: "none",
        error:
          error instanceof Error
            ? error.message
            : "Simulation is unavailable. Use the camera to try the application.",
      });
    }
  }
  private startTracking() {
    if (this.worker) return;
    this.emit({ model: "loading", hands: 0 });
    const worker = new Worker(new URL("./hand.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker = worker;
    const failed = () => {
      if (this.worker !== worker) return;
      this.stopTracking();
      this.emit({
        model: "error",
        error:
          "Could not load or run the hand model. Use simulation mode or try again.",
      });
    };
    this.modelTimer = window.setTimeout(failed, 30000);
    worker.onerror = failed;
    worker.onmessage = (event) => {
      if (this.worker !== worker) return;
      const data = event.data;
      if (data.type === "ready") {
        window.clearTimeout(this.modelTimer);
        this.emit({ model: "ready", error: "" });
        this.scheduleInference();
      }
      if (data.type === "error") {
        console.error("MediaPipe:", data.message);
        failed();
      }
      if (data.type === "result") {
        this.busy = false;
        const now = performance.now();
        this.lastResult = now;
        const hands: Hand[] = data.hands;
        this.emit({ hands: hands.length });
        const pair = this.identity.match(hands, now);
        this.raw = pair ? handQuad(pair) : null;
        if (this.raw && validQuad(this.raw)) this.validFrames++;
        else this.validFrames = 0;
      }
    };
    const base = new URL(import.meta.env.BASE_URL, document.baseURI);
    worker.postMessage({
      type: "init",
      wasm: new URL("wasm", base).href,
      model: new URL("models/hand_landmarker.task", base).href,
    });
  }
  retryModel() {
    this.stopTracking();
    if (this.status.camera === "on" && this.mode === "hands")
      this.startTracking();
  }
  private scheduleInference = () => {
    const worker = this.worker;
    if (!worker) return;
    this.inferenceTimer = window.setTimeout(this.scheduleInference, 50);
    if (this.busy) {
      if (performance.now() - this.busySince > 5000) {
        this.stopTracking();
        this.emit({
          model: "error",
          error:
            "Detection stopped responding. Try loading the model again.",
        });
      }
      return;
    }
    if (
      this.video.readyState < 2 ||
      this.video.currentTime === this.lastVideoTime ||
      document.hidden
    )
      return;
    this.lastVideoTime = this.video.currentTime;
    this.busy = true;
    this.busySince = performance.now();
    createImageBitmap(this.video, {
      resizeWidth: 640,
      resizeHeight: Math.round(
        (640 * this.video.videoHeight) / this.video.videoWidth,
      ),
    })
      .then((bitmap) => {
        if (this.worker !== worker) {
          bitmap.close();
          return;
        }
        worker.postMessage({ type: "frame", bitmap, time: performance.now() }, [
          bitmap,
        ]);
      })
      .catch(() => {
        if (this.worker === worker) {
          this.busy = false;
          this.raw = null;
          this.validFrames = 0;
        }
      });
  };
  private stopTracking() {
    window.clearTimeout(this.inferenceTimer);
    window.clearTimeout(this.modelTimer);
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = (e) => {
        if (e.data.type === "closed") worker.terminate();
      };
      worker.postMessage({ type: "dispose" });
      window.setTimeout(() => worker.terminate(), 500);
    }
    this.busy = false;
    this.raw = null;
    this.validFrames = 0;
    this.lastResult = 0;
    this.lastVideoTime = -1;
    this.identity.reset();
    this.emit({ model: "idle", hands: 0 });
  }
  private render = (now: number) => {
    if (!this.renderer || !this.material) return;
    this.raf = requestAnimationFrame(this.render);
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    let candidate: Quad | null = null;
    if (this.mode === "simulation") candidate = this.manual;
    else if (this.raw && this.validFrames >= 2 && now - this.lastResult < 250)
      candidate = this.raw.map((p) => landmarkToUV(p, this.crop)) as Quad;
    let valid = !!candidate && validQuad(candidate);
    if (valid && candidate) {
      const smoothed =
        this.mode === "simulation" || !this.smoothed
          ? candidate
          : smoothQuad(this.smoothed, candidate, dt);
      if (validQuad(smoothed)) {
        this.smoothed = smoothed;
        this.lastGood = smoothed;
      } else valid = false;
    }
    this.visibility = fade(this.visibility, valid, dt);
    this.emit({
      geometry: valid ? "valid" : candidate ? "invalid" : "waiting",
    });
    const u = this.material.uniforms;
    u.uTime.value = now / 1000;
    u.uIntensity.value = this.intensity;
    u.uEffect.value = this.effect;
    u.uVisibility.value = this.visibility;
    u.uPolygonValid.value = this.visibility > 0 ? 1 : 0;
    this.lastGood.forEach((p, i) => u.uPolygon.value[i].set(p.x, p.y));
    this.renderer.render(this.scene, this.camera);
    this.recording.frame(this.renderer.domElement);
    const points = this.mode === "simulation" ? this.manual : this.lastGood;
    const line = this.svg.querySelector("polygon")!;
    line.setAttribute(
      "points",
      points
        .map(
          (p) =>
            `${p.x * this.host.clientWidth},${(1 - p.y) * this.host.clientHeight}`,
        )
        .join(" "),
    );
    this.svg.style.opacity = this.outline
      ? String(this.mode === "simulation" ? 1 : this.visibility)
      : "0";
    this.svg.style.pointerEvents =
      this.mode === "simulation" && this.outline ? "auto" : "none";
    this.svg.dataset.valid = String(valid);
    this.svg.querySelectorAll<SVGGElement>(".vertex").forEach((group, i) => {
      group.setAttribute(
        "transform",
        `translate(${points[i].x * this.host.clientWidth} ${(1 - points[i].y) * this.host.clientHeight})`,
      );
    });
  };
  setPoint(i: number, point: Point) {
    this.manual[i] = point;
  }
  reset() {
    this.manual = initialQuad();
  }
  stop() {
    ++this.epoch;
    this.release();
    this.emit({ camera: "off", source: "none", geometry: "waiting" });
  }
  startRecording() {
    if (this.renderer) this.recording.start(this.renderer.domElement);
  }
  stopRecording() {
    this.recording.stop();
  }
  private release() {
    this.recording.stop();
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.testTimer);
    this.stopTracking();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.renderer?.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.renderer?.domElement.remove();
    this.scene.clear();
    this.geometry?.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.material = null;
    this.texture = null;
    this.geometry = null;
    this.visibility = 0;
    this.smoothed = null;
    this.svg.style.opacity = "0";
    this.svg.style.pointerEvents = "none";
  }
  dispose() {
    this.destroyed = true;
    this.recording.dispose();
    ++this.epoch;
    this.release();
    this.resizeObserver.disconnect();
    this.video.removeEventListener("resize", this.videoResize);
  }
}
