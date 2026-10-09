import type { Point, Quad } from "./geometry";
export type Hand = {
  wrist: Point;
  index: Point;
  thumb: Point;
  label: string;
  score: number;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export class HandIdentity {
  private previous: [Hand, Hand] | null = null;
  private lastSeen = 0;
  reset() {
    this.previous = null;
    this.lastSeen = 0;
  }
  match(hands: Hand[], time: number): [Hand, Hand] | null {
    if (
      hands.length !== 2 ||
      hands.some(
        (h) =>
          h.score < 0.55 ||
          [h.wrist, h.index, h.thumb].some(
            (p) => !Number.isFinite(p.x) || !Number.isFinite(p.y),
          ),
      )
    )
      return null;
    let pair: [Hand, Hand] = [hands[0], hands[1]];
    if (this.previous && time - this.lastSeen < 1200) {
      const prev = this.previous;
      const cost = (a: Hand, b: Hand) =>
        distance(a.wrist, b.wrist) + (a.label !== b.label ? 0.1 : 0);
      if (
        cost(pair[1], prev[0]) + cost(pair[0], prev[1]) <
        cost(pair[0], prev[0]) + cost(pair[1], prev[1])
      )
        pair = [pair[1], pair[0]];
      // Reject implausible discontinuities rather than permuting polygon vertices.
      if (
        time - this.lastSeen < 250 &&
        pair.some((h, i) => distance(h.wrist, prev[i].wrist) > 0.35)
      )
        return null;
    } else if (pair[0].wrist.x < pair[1].wrist.x) pair = [pair[1], pair[0]];
    this.previous = pair;
    this.lastSeen = time;
    return pair;
  }
}
export const handQuad = (pair: [Hand, Hand]): Quad => [
  pair[0].index,
  pair[1].index,
  pair[1].thumb,
  pair[0].thumb,
];
