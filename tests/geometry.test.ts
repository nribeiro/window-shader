import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validQuad,
  initialQuad,
  coverScale,
  landmarkToUV,
  uvToSource,
  pointerToUV,
  smoothQuad,
  fade,
} from "../src/geometry.ts";
import type { Point, Quad } from "../src/geometry.ts";
import { HandIdentity, handQuad } from "../src/tracking.ts";
import type { Hand } from "../src/tracking.ts";
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test("accepts both convex windings, rejects crossing, concavity, zero edges, small area and nonfinite vertices", () => {
  const p = initialQuad();
  assert.ok(validQuad(p));
  assert.ok(validQuad([...p].reverse()));
  for (const invalid of [
    [p[0], p[2], p[1], p[3]],
    [p[0], p[1], { x: 0.45, y: 0.65 }, p[3]],
    [p[0], p[0], p[2], p[3]],
    [
      { x: 0, y: 0 },
      { x: 0.01, y: 0 },
      { x: 0.01, y: 0.01 },
      { x: 0, y: 0.01 },
    ],
    [{ x: NaN, y: 0 }, ...p.slice(1)],
    [{ x: Infinity, y: 0 }, ...p.slice(1)],
  ])
    assert.equal(validQuad(invalid), false);
});
test("cover crop, mirror and vertical flip roundtrip for landscape, portrait and resized stage", () => {
  for (const [w, h] of [
    [1280, 720],
    [900, 675],
    [360, 640],
    [1920, 600],
  ]) {
    const crop = coverScale(1280, 720, w, h);
    for (const p of [
      { x: 0, y: 0 },
      { x: 0.15, y: 0.63 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ]) {
      const uv = landmarkToUV(p, crop),
        back = uvToSource(uv, crop);
      close(p.x, back.x);
      close(p.y, back.y);
    }
  }
  assert.deepEqual(landmarkToUV({ x: 0.2, y: 0.3 }, { x: 1, y: 1 }), {
    x: 0.8,
    y: 0.7,
  });
});
test("pointer uses same bottom-left UV and clamps to stage", () => {
  assert.deepEqual(
    pointerToUV(150, 100, { left: 100, top: 50, width: 200, height: 100 }),
    { x: 0.25, y: 0.5 },
  );
  assert.deepEqual(
    pointerToUV(0, 300, { left: 100, top: 50, width: 200, height: 100 }),
    { x: 0, y: 0 },
  );
});
test("smoothing approaches without overshoot and fade reaches exact zero", () => {
  const from = initialQuad(),
    to = from.map((p) => ({ x: p.x + 0.1, y: p.y + 0.1 })) as Quad;
  const s = smoothQuad(from, to, 1 / 60);
  s.forEach((p, i) => {
    assert.ok(p.x > from[i].x && p.x < to[i].x);
  });
  let v = 1;
  for (let i = 0; i < 90; i++) v = fade(v, false, 1 / 60);
  assert.equal(v, 0);
  assert.ok(fade(v, true, 1 / 60) > 0);
});
const hand = (x: number, label: string): Hand => ({
  wrist: { x, y: 0.6 },
  index: { x, y: 0.25 },
  thumb: { x: x + (x < 0.5 ? 0.12 : -0.12), y: 0.65 },
  label,
  score: 0.95,
});
test("identity survives detector array reordering and temporary hand loss without reordering vertices", () => {
  const tracker = new HandIdentity(),
    a = hand(0.25, "Left"),
    b = hand(0.75, "Right");
  const first = tracker.match([a, b], 100)!;
  assert.equal(first[0], b);
  const next = tracker.match([b, a], 150)!;
  assert.equal(next[0], b);
  assert.deepEqual(handQuad(next), [b.index, a.index, a.thumb, b.thumb]);
  assert.equal(tracker.match([a], 200), null);
  assert.equal(tracker.match([a, b], 300)![0], b);
});
test("identity rejects low-confidence and implausible discontinuities", () => {
  const tracker = new HandIdentity();
  tracker.match([hand(0.25, "Left"), hand(0.75, "Right")], 100);
  assert.equal(
    tracker.match(
      [{ ...hand(0.25, "Left"), score: 0.2 }, hand(0.75, "Right")],
      150,
    ),
    null,
  );
  const a = hand(0.25, "Left"),
    b = hand(0.75, "Right");
  a.wrist.y = 0;
  b.wrist.y = 0;
  assert.equal(tracker.match([a, b], 200), null);
});
