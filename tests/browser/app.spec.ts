import { test, expect, type Page } from "@playwright/test";
async function pixels(page: Page) {
  return page.locator(".stage canvas").evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl2")!;
    const data = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
    );
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    const sample = (x: number, y: number) =>
      Array.from(
        data.slice(
          (Math.floor(y * gl.drawingBufferHeight) * gl.drawingBufferWidth +
            Math.floor(x * gl.drawingBufferWidth)) *
            4,
          (Math.floor(y * gl.drawingBufferHeight) * gl.drawingBufferWidth +
            Math.floor(x * gl.drawingBufferWidth)) *
            4 +
            4,
        ),
      );
    return {
      center: sample(0.5, 0.5),
      grid: Array.from({ length: 400 }, (_, i) =>
        sample(((i % 20) + 0.5) / 20, (Math.floor(i / 20) + 0.5) / 20),
      ),
      exterior: Array.from({ length: 400 }, (_, i) => ({
        x: ((i % 20) + 0.5) / 20,
        y: (Math.floor(i / 20) + 0.5) / 20,
      }))
        .filter((p) => p.x < 0.2 || p.x > 0.8 || p.y < 0.15 || p.y > 0.85)
        .map((p) => sample(p.x, p.y)),
      outside: sample(0.1, 0.5),
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    };
  });
}
async function intensity(page: Page, value: number) {
  await page.locator("#intensity").fill(String(value));
  await page.waitForTimeout(150);
}
test("simulation: real WebGL shader, masks, zero intensity, drag, invalid geometry, resize and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "One window. Another reality." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-initial.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try simulation" }).click();
  await expect(page.locator(".stage canvas")).toBeVisible();
  await expect(page.locator(".overlay")).toHaveAttribute("data-valid", "true");
  await page.waitForTimeout(500);
  const psychedelic = await pixels(page);
  expect(psychedelic.center[3]).toBe(255);
  expect(psychedelic.center.slice(0, 3).some((n) => n > 0)).toBeTruthy();
  await intensity(page, 0);
  const original = await pixels(page);
  expect(original.center).not.toEqual(psychedelic.center);
  expect(original.outside).toEqual(psychedelic.outside);
  await expect(page.getByRole("combobox", { name: "Window shader" }).locator("option")).toHaveCount(11);
  await expect(page.getByRole("button", { name: /^Disney/ })).toHaveCount(0);
  const polygonBefore = await page
    .locator(".overlay polygon")
    .getAttribute("points");
  for (const effect of [
    "Pixelation",
    "Distortion",
    "Terminator",
    "Thermal",
    "Neon",
    "Negative",
    "Minecraft",
    "Halftone dots",
    "Ordered dithering",
    "Glitch",
    "Psychedelic",
  ]) {
    await page
      .getByRole("combobox", { name: "Window shader" })
      .selectOption({ label: effect });
    await expect(
      page.getByRole("button", { name: new RegExp("^" + effect) }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await page.locator(".overlay polygon").getAttribute("points")).toBe(
      polygonBefore,
    );
    await page.waitForTimeout(100);
    expect((await pixels(page)).grid).toEqual(original.grid);
    await intensity(page, 100);
    const processed = await pixels(page);
    expect(processed.exterior).toEqual(original.exterior);
    expect(processed.grid).not.toEqual(original.grid);
    if (["Halftone dots", "Glitch"].includes(effect)) {
      await page.locator(".stage").screenshot({path:`test-results/updated-${effect.replaceAll(" ","-")}.png`});
    }
    if (effect === "Halftone dots") {
      const interior = processed.grid.filter((_,i)=>i%20>=8 && i%20<=11 && Math.floor(i/20)>=8 && Math.floor(i/20)<=11);
      expect(interior.some(p=>Math.max(...p.slice(0,3))-Math.min(...p.slice(0,3))>50)).toBe(true);
    }
    if (effect === "Terminator") {
      expect(processed.center[0]).toBeGreaterThan(processed.center[1] * 2);
      await page.screenshot({
        path: "test-results/terminator.png",
        fullPage: true,
      });
    }
    await intensity(page, 0);
  }
  const vertex = page.getByRole("slider", { name: "Vertex 1" });
  await vertex.focus();
  await page.keyboard.press("ArrowRight");
  expect((await pixels(page)).center).toEqual(original.center);
  const box = await vertex.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 60, box!.y + 25);
  await page.mouse.up();
  await expect(page.locator(".overlay")).toHaveAttribute("data-valid", "true");
  await page.getByRole("button", { name: "Reset vertices" }).click();
  await intensity(page, 100);
  const stage = await page.locator(".stage").boundingBox(),
    point = await vertex.boundingBox();
  await page.mouse.move(
    point!.x + point!.width / 2,
    point!.y + point!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    stage!.x + stage!.width * 0.8,
    stage!.y + stage!.height * 0.8,
  );
  await page.mouse.up();
  await expect(page.locator(".overlay")).toHaveAttribute("data-valid", "false");
  await page.waitForTimeout(800);
  expect((await pixels(page)).center).toEqual(original.center);
  await page.getByRole("button", { name: "Reset vertices" }).click();
  await expect(page.locator(".overlay")).toHaveAttribute("data-valid", "true");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/desktop-simulation.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".stage canvas")).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-simulation.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("synthetic camera: model loads, switches modes, releases streams, restarts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    (window as any).__streams = [];
    navigator.mediaDevices.getUserMedia = async (c) => {
      const stream = await original(c);
      (window as any).__streams.push(stream);
      return stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Live · mirrored")).toBeVisible();
  await expect(page.getByText("Model ready")).toBeVisible({ timeout: 45000 });
  await expect(page.getByText("0/2 hands")).toBeVisible();
  await page.getByRole("button", { name: "Simulation", exact: true }).click();
  await expect(page.locator(".overlay")).toHaveAttribute("data-valid", "true");
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.locator(".stage canvas")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).__streams.every((s: MediaStream) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByText("Live · mirrored")).toBeVisible();
  await expect(page.locator(".stage canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await expect(page.getByText("Model ready")).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Stop camera" }).click();
  expect(await page.evaluate(() => (window as any).__streams.length)).toBe(2);
  expect(
    await page.evaluate(() =>
      (window as any).__streams.every((s: MediaStream) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});
test("permission failure gives clear feedback and simulation remains usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".message")).toContainText("Permission denied");
  await page.getByRole("button", { name: "Try simulation" }).click();
  await expect(page.locator(".stage canvas")).toBeVisible();
});

test("a camera permission resolved after cancellation cannot create a stray stream", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    (window as any).__streams = [];
    navigator.mediaDevices.getUserMedia = (c) =>
      new Promise((resolve) => {
        (window as any).__releasePermission = async () => {
          const stream = await original(c);
          (window as any).__streams.push(stream);
          resolve(stream);
        };
      });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await page.evaluate(() => (window as any).__releasePermission());
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__streams[0]
          ?.getTracks()
          .every((t: MediaStreamTrack) => t.readyState === "ended"),
      ),
    )
    .toBe(true);
  await expect(page.locator(".stage canvas")).toHaveCount(0);
});

test("model download failure preserves video and provides retry and simulation", async ({
  page,
}) => {
  await page.route("**/models/hand_landmarker.task", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByText("Model error", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stage canvas")).toHaveCount(1);
  await page.unroute("**/models/hand_landmarker.task");
  await page.getByRole("button", { name: "Retry model load" }).click();
  await expect(page.getByText("Model ready")).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Simulation", exact: true }).click();
  await expect(page.locator(".overlay")).toHaveAttribute("data-valid", "true");
  await page.getByRole("button", { name: "Stop camera" }).click();
});

test("WebGL unavailable gives actionable feedback and releases camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: any[]
    ) {
      if (type === "webgl2" || type === "webgl") return null;
      return (original as any).call(this, type, ...args);
    } as any;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".message")).toContainText(
    "WebGL is unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Start camera" }),
  ).toBeVisible();
  await expect(page.locator(".stage canvas")).toHaveCount(0);
});

test("scripted hand observations fade on loss and invalid geometry, recover without vertex swaps", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const fixture = [
      {
        wrist: { x: 0.75, y: 0.6 },
        index: { x: 0.72, y: 0.27 },
        thumb: { x: 0.68, y: 0.7 },
        label: "Left",
        score: 0.99,
      },
      {
        wrist: { x: 0.25, y: 0.6 },
        index: { x: 0.27, y: 0.32 },
        thumb: { x: 0.32, y: 0.73 },
        label: "Right",
        score: 0.99,
      },
    ];
    (window as any).__observations = fixture;
    (window as any).__fixture = fixture;
    class ScriptedWorker {
      onmessage: ((event: any) => void) | null = null;
      onerror: any = null;
      postMessage(data: any) {
        if (data.type === "init")
          setTimeout(() => this.onmessage?.({ data: { type: "ready" } }), 0);
        if (data.type === "frame") {
          data.bitmap.close();
          setTimeout(
            () =>
              this.onmessage?.({
                data: {
                  type: "result",
                  hands: (window as any).__observations,
                  time: data.time,
                },
              }),
            0,
          );
        }
      }
      terminate() {}
    }
    window.Worker = ScriptedWorker as any;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const overlay = page.locator(".overlay");
  await expect(overlay).toHaveAttribute("data-valid", "true");
  await expect(page.getByText("2/2 hands")).toBeVisible();
  await expect
    .poll(() =>
      overlay.evaluate((e) => Number((e as SVGElement).style.opacity)),
    )
    .toBeGreaterThan(0.95);
  const points = await overlay.locator("polygon").getAttribute("points");
  await page.evaluate(
    () =>
      ((window as any).__observations = [
        ...(window as any).__fixture,
      ].reverse()),
  );
  await page.waitForTimeout(200);
  expect(await overlay.locator("polygon").getAttribute("points")).toBe(points);
  await page.evaluate(() => ((window as any).__observations = []));
  await expect
    .poll(() =>
      overlay.evaluate((e) => Number((e as SVGElement).style.opacity)),
    )
    .toBe(0);
  expect(await overlay.locator("polygon").getAttribute("points")).toBe(points);
  await page.evaluate(
    () => ((window as any).__observations = (window as any).__fixture),
  );
  await expect(overlay).toHaveAttribute("data-valid", "true");
  await expect
    .poll(() =>
      overlay.evaluate((e) => Number((e as SVGElement).style.opacity)),
    )
    .toBeGreaterThan(0.95);
  await page.evaluate(() => {
    const hands = structuredClone((window as any).__fixture);
    hands[0].thumb = hands[0].index;
    (window as any).__observations = hands;
  });
  await expect
    .poll(() =>
      overlay.evaluate((e) => Number((e as SVGElement).style.opacity)),
    )
    .toBe(0);
  expect(await overlay.locator("polygon").getAttribute("points")).toBe(points);
  await page.getByRole("button", { name: "Stop camera" }).click();
});

test("returning from simulation leaves the start button clickable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try simulation" }).click();
  await expect(page.locator(".overlay")).toHaveAttribute("data-valid", "true");
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Live · mirrored")).toBeVisible();
  await page.getByRole("button", { name: "Stop camera" }).click();
});

test("fullscreen, MP4 recording and a playable shader capture survive resize", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Record", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Try simulation" }).click();
  await page
    .getByRole("combobox", { name: "Window shader" })
    .selectOption({ label: "Terminator" });
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fullscreenElement?.classList.contains("stage"),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop recording" }),
  ).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("00:01", {
    timeout: 5000,
  });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Stop recording" }).click();
  const link = page.getByRole("link", { name: /Download (MP4|WebM)/i });
  await expect(link).toBeVisible();
  const expected = await page.evaluate(() =>
    ["video/mp4;codecs=avc1.42001f", "video/mp4"].some((t) =>
      MediaRecorder.isTypeSupported(t),
    )
      ? "mp4"
      : "webm",
  );
  expect(await link.getAttribute("download")).toMatch(
    new RegExp("\\." + expected + "$"),
  );
  const info = await link.evaluate(async (element: HTMLAnchorElement) => {
    const blob = await (await fetch(element.href)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = element.href;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () =>
        reject(new Error("Recorded video cannot be decoded"));
    });
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    const center = Array.from(
      ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
    );
    const outside = Array.from(
      ctx.getImageData(canvas.width * 0.15, canvas.height * 0.5, 1, 1).data,
    );
    video.pause();
    video.removeAttribute("src");
    video.load();
    return {
      size: blob.size,
      type: blob.type,
      header: String.fromCharCode(...bytes.slice(4, 8)),
      width: canvas.width,
      height: canvas.height,
      center,
      outside,
    };
  });
  console.log("Recording verified:", info.type, info.header, info.width, info.height);
  expect(info.size).toBeGreaterThan(1000);
  expect(info.width).toBeGreaterThan(0);
  expect(info.center[0]).toBeGreaterThan(info.center[1] * 1.5);
  expect(info.outside[1]).toBeGreaterThan(20);
  if (expected === "mp4") {
    expect(info.type).toContain("mp4");
    expect(info.header).toBe("ftyp");
  }
  const download = page.waitForEvent("download");
  await link.click();
  expect((await download).suggestedFilename()).toMatch(
    new RegExp("\\." + expected + "$"),
  );
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.waitForTimeout(800);
  // Releasing the source finishes the file instead of losing it.
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await expect(link).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record", exact: true }),
  ).toBeDisabled();
});

test("unsupported recording and denied fullscreen give visible feedback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "MediaRecorder", { value: undefined });
    Element.prototype.requestFullscreen = async () => {
      throw new Error("Denied");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try simulation" }).click();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("does not support recording");
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("fullscreen");
});

test("WebM fallback uses an actual WebM container when MP4 is unsupported", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = (type) =>
      !type.includes("mp4") && supported(type);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try simulation" }).click();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByRole("timer")).toContainText("WebM");
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Stop recording" }).click();
  const link = page.getByRole("link", { name: /Download WEBM/i });
  await expect(link).toBeVisible();
  expect(await link.getAttribute("download")).toMatch(/\.webm$/);
  const header = await link.evaluate(async (a: HTMLAnchorElement) =>
    Array.from(
      new Uint8Array(
        await (await (await fetch(a.href)).blob()).arrayBuffer(),
      ).slice(0, 4),
    ),
  );
  expect(header).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
});
