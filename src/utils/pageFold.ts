/**
 * Straight-crease paper fold, in page-local units: x runs from the spine (0)
 * to the outer edge (1), y runs down from the top edge (0) to the bottom (ph).
 */
export type Vec2 = [number, number]

export type Fold = {
  /** Unit normal pointing from the lifted corner's position back to its rest spot. */
  n: Vec2
  /** Midpoint of the corner and its rest spot; the crease passes through here. */
  M: Vec2
  len: number
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
export const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** Keeps the spine edge attached: the corner can't pull further than the paper allows. */
export function constrain(P: Vec2, C: Vec2, ph: number): Vec2 {
  const s1: Vec2 = [0, C[1]]
  const s2: Vec2 = [0, ph - C[1]]
  const diag = Math.hypot(1, ph)
  let [x, y] = P
  for (let i = 0; i < 3; i++) {
    let dx = x - s1[0]
    let dy = y - s1[1]
    let d = Math.hypot(dx, dy)
    if (d > 1) {
      x = s1[0] + dx / d
      y = s1[1] + dy / d
    }
    dx = x - s2[0]
    dy = y - s2[1]
    d = Math.hypot(dx, dy)
    if (d > diag) {
      x = s2[0] + (dx / d) * diag
      y = s2[1] + (dy / d) * diag
    }
  }
  return [x, y]
}

export function foldOf(C: Vec2, P: Vec2): Fold | null {
  const dx = C[0] - P[0]
  const dy = C[1] - P[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-4) return null
  return { n: [dx / len, dy / len], M: [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2], len }
}

/** Paper grabbed at G is now under the pointer at Q: fold along their perpendicular bisector. */
export function foldFromGrab(G: Vec2, Q: Vec2, C: Vec2, ph: number): { C: Vec2; P: Vec2 } | null {
  const dx = G[0] - Q[0]
  const dy = G[1] - Q[1]
  const L = Math.hypot(dx, dy)
  if (L < 1e-5) return null
  const n: Vec2 = [dx / L, dy / L]
  const M: Vec2 = [(G[0] + Q[0]) / 2, (G[1] + Q[1]) / 2]
  const d = (C[0] - M[0]) * n[0] + (C[1] - M[1]) * n[1]
  if (d <= 0) return null
  return { C, P: constrain([C[0] - 2 * d * n[0], C[1] - 2 * d * n[1]], C, ph) }
}

/** 0 while the page is flat, 1 once its corner has reached the far side of the spine. */
export const foldProgress = (C: Vec2, P: Vec2) => clamp((C[0] - P[0]) / 2, 0, 1)

/** A rigid board swung open by angle t (0…pi) around the spine: [distance from spine, height]. */
export function boardPoint(x: number, t: number, out: [number, number]) {
  out[0] = x * Math.cos(t)
  out[1] = x * Math.sin(t)
  return out
}

const CURL_RADIUS = 0.08

/** The curl relaxes near both ends of a turn so the page starts and lands perfectly flat. */
export function curlRadius(len: number) {
  return (
    CURL_RADIUS *
    smoothstep(clamp(len / 0.45, 0, 1)) *
    smoothstep(clamp((2 - len) / 0.45, 0, 1))
  )
}

/**
 * Where a point of the page ends up when it is folded over a cylinder of
 * radius r lying along the crease. Returns [x, y, height, weight], where
 * weight goes from 0 (still on its own stack) to 1 (lying folded over).
 * The crease is shifted towards the corner's target by pi*r/2 so the folded
 * paper lands exactly where a flat reflection would put it.
 */
export function curlPoint(
  x: number,
  y: number,
  fold: Fold,
  r: number,
  out: [number, number, number, number],
) {
  const [nx, ny] = fold.n
  const shift = (Math.PI * r) / 2
  const mx = fold.M[0] - nx * shift
  const my = fold.M[1] - ny * shift
  const d = (x - mx) * nx + (y - my) * ny
  if (d <= 0) {
    out[0] = x
    out[1] = y
    out[2] = 0
    out[3] = 0
    return out
  }
  const bx = x - d * nx
  const by = y - d * ny
  if (d < Math.PI * r) {
    const a = d / r
    const s = r * Math.sin(a)
    const c = 1 - Math.cos(a)
    out[0] = bx + s * nx
    out[1] = by + s * ny
    out[2] = r * c
    out[3] = c / 2
    return out
  }
  const e = d - Math.PI * r
  out[0] = bx - e * nx
  out[1] = by - e * ny
  out[2] = 2 * r
  out[3] = 1
  return out
}
