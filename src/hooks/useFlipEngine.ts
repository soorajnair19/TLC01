import { useCallback, useEffect, useState } from 'react'
import {
  clamp,
  constrain,
  easeInOut,
  easeOut,
  foldFromGrab,
  foldProgress,
  smoothstep,
  type Vec2,
} from '../utils/pageFold'

type Dir = 1 | -1
type Mode = 'idle' | 'drag' | 'anim'

type CurlAnim = {
  from: Vec2
  to: Vec2
  t0: number
  dur: number
  lift: number
  complete: boolean
  ease: (t: number) => number
}

type HardAnim = {
  from: number
  to: number
  t0: number
  dur: number
  complete: boolean
  ease: (t: number) => number
}

export type CurlFlip = { dir: Dir; hard: false; C: Vec2; P: Vec2; anim?: CurlAnim }
export type HardFlip = { dir: Dir; hard: true; t: number; grab: number; anim?: HardAnim }
export type Flip = CurlFlip | HardFlip

type Drag = {
  dir: Dir
  G: Vec2
  shift: number
  start: Vec2
  startPt: Vec2
  t0: number
  samples: [number, number][]
  moved: boolean
  tapY: number
}

export type Hit = { dir: Dir; x: number; y: number }
export type TapResult = { dir: Dir; x: number; y: number }

const MAX_TAP_QUEUE = 4
const TAP_MOVE_PX = 6
const TAP_MS = 500
const VELOCITY_WINDOW_MS = 110
const FLICK_VELOCITY = 1.1
const WRONG_WAY_SWIPE = 0.08

/**
 * Page-turn state machine. Points are in page units: x is signed distance
 * from the spine in page widths (positive = right page), y runs down from
 * the top edge (0…ph). Sheet `index` is the top page on the right; sheets
 * below `index` lie on the left.
 */
export class FlipEngine {
  index = 0
  mode: Mode = 'idle'
  flip: Flip | null = null
  private readonly onIndex: (index: number) => void
  private drag: Drag | null = null
  private queue: Dir[] = []
  private jumpStepMs: number | null = null
  private readonly reduceMotion: boolean
  readonly count: number
  readonly ph: number

  constructor(count: number, ph: number, onIndex: (index: number) => void) {
    this.count = count
    this.ph = ph
    this.onIndex = onIndex
    this.reduceMotion =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  get dragging() {
    return this.drag != null
  }

  canTurn(dir: Dir) {
    return dir > 0 ? this.index < this.count : this.index > 0
  }

  /** The covers are boards that swing on the spine instead of curling. */
  isHard(dir: Dir) {
    const last = this.count - 1
    return dir > 0
      ? this.index === 0 || this.index === last
      : this.index === 1 || this.index === this.count
  }

  /** Sheet currently in motion, or -1. */
  turningSheet() {
    if (!this.flip) return -1
    return this.flip.dir > 0 ? this.index : this.index - 1
  }

  progress() {
    const f = this.flip
    if (!f) return 0
    if (f.hard) return f.t / Math.PI
    return foldProgress(f.C, f.P)
  }

  /** Horizontal offset in page widths: a closed book sits centred and slides over as it opens. */
  restOffset() {
    const rest = (i: number) => (i === 0 ? -0.5 : i === this.count ? 0.5 : 0)
    const a = rest(this.index)
    if (!this.flip) return a
    return a + (rest(this.index + this.flip.dir) - a) * smoothstep(this.progress())
  }

  hitTest(pt: Vec2): Hit | null {
    const [lx, ly] = pt
    if (ly < -0.04 || ly > this.ph + 0.04) return null
    const y = clamp(ly, 0, this.ph)
    if (lx >= 0 && lx < 1.06 && this.canTurn(1)) return { dir: 1, x: Math.min(lx, 1), y }
    if (lx < 0 && lx > -1.06 && this.canTurn(-1)) return { dir: -1, x: Math.min(-lx, 1), y }
    return null
  }

  /** Whether a point lies over either page area, regardless of what can turn. */
  overBook(pt: Vec2) {
    return Math.abs(pt[0]) < 1.06 && pt[1] > -0.04 && pt[1] < this.ph + 0.04
  }

  // ---------- animation ----------

  private dur(ms: number) {
    return this.reduceMotion ? ms * 0.6 : ms
  }

  private startAnim(complete: boolean, o: { dur?: number; lift?: number; ease?: (t: number) => number } = {}) {
    const f = this.flip
    if (!f) return
    const t0 = performance.now()
    if (f.hard) {
      const to = complete ? Math.PI : 0
      const from = f.t
      const dur = this.dur(o.dur ?? 180 + (640 * Math.abs(to - from)) / Math.PI)
      f.anim = { from, to, t0, dur, complete, ease: o.ease ?? easeOut }
    } else {
      const to: Vec2 = complete ? [-f.C[0], f.C[1]] : [f.C[0], f.C[1]]
      const from: Vec2 = [f.P[0], f.P[1]]
      const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
      const dur = this.dur(o.dur ?? 150 + 470 * Math.min(1, dist / 2))
      f.anim = { from, to, t0, dur, lift: o.lift ?? 0, complete, ease: o.ease ?? easeOut }
    }
    this.mode = 'anim'
  }

  tapTurn(dir: Dir, cornerY: number) {
    if (!this.canTurn(dir)) {
      if (this.mode !== 'anim') {
        this.flip = null
        this.mode = 'idle'
      }
      return
    }
    const queued = this.queue.length > 0
    if (this.isHard(dir)) {
      if (!this.flip || this.flip.dir !== dir || !this.flip.hard) {
        this.flip = { dir, hard: true, t: 0, grab: 1 }
      }
      const quick = this.jumpStepMs != null ? Math.min(560, this.jumpStepMs * 1.6) : 560
      this.startAnim(true, { ease: easeInOut, dur: queued ? quick : 1000 })
      return
    }
    const f = this.flip
    const flat =
      !f || f.dir !== dir || f.hard || Math.hypot(f.P[0] - f.C[0], f.P[1] - f.C[1]) < 1e-3
    if (flat) this.flip = { dir, hard: false, C: [1, cornerY], P: [1, cornerY] }
    const curl = this.flip as CurlFlip
    const quick = this.jumpStepMs ?? (this.queue.length > 2 ? 340 : 440)
    this.startAnim(true, {
      lift: curl.C[1] > 0 ? -0.3 : 0.3,
      ease: easeInOut,
      dur: queued ? quick : 820,
    })
  }

  /** Advances the running animation; call once per frame. */
  step(now = performance.now()) {
    const f = this.flip
    if (this.mode !== 'anim' || !f?.anim) return
    const a = f.anim
    const t = Math.min(1, (now - a.t0) / a.dur)
    const e = a.ease(t)
    if (f.hard) {
      const h = f.anim as HardAnim
      f.t = h.from + (h.to - h.from) * e
    } else {
      const c = f.anim as CurlAnim
      const x = c.from[0] + (c.to[0] - c.from[0]) * e
      const y = c.from[1] + (c.to[1] - c.from[1]) * e + c.lift * Math.sin(Math.PI * e)
      f.P = constrain([x, y], f.C, this.ph)
    }
    if (t < 1) return

    const done = a.complete
    const dir = f.dir
    this.flip = null
    this.mode = 'idle'
    if (done) {
      this.index += dir
      this.onIndex(this.index)
    }
    while (this.queue.length && !this.canTurn(this.queue[0])) this.queue.shift()
    if (this.queue.length) {
      this.tapTurn(this.queue.shift()!, this.ph)
    } else {
      this.jumpStepMs = null
    }
  }

  finishAnimNow() {
    this.queue.length = 0
    this.jumpStepMs = null
    if (this.mode === 'anim' && this.flip?.anim) {
      this.flip.anim.t0 = -1e9
      this.step(performance.now())
    }
  }

  turn(dir: Dir) {
    if (this.mode === 'drag') return
    this.jumpStepMs = null
    if (this.mode === 'anim') {
      if (this.queue.length < MAX_TAP_QUEUE) this.queue.push(dir)
      return
    }
    this.tapTurn(dir, this.ph)
  }

  goTo(requested: number) {
    if (this.mode === 'drag') return
    const target = clamp(Math.round(requested), 0, this.count)
    let at = this.index
    if (this.mode === 'anim' && this.flip?.anim?.complete) at += this.flip.dir
    this.queue.length = 0
    const distance = Math.abs(target - at)
    if (!distance) return
    const dir: Dir = target > at ? 1 : -1
    for (let i = 0; i < distance; i++) this.queue.push(dir)
    // long jumps share a time budget so flipping across the book stays brisk
    this.jumpStepMs = distance > 3 ? clamp(1500 / distance, 90, 340) : null
    if (this.mode !== 'anim') this.tapTurn(this.queue.shift()!, this.ph)
  }

  // ---------- dragging ----------

  beginDrag(hit: Hit, pt: Vec2, screen: Vec2) {
    const dir = hit.dir
    const xl: Vec2 = [dir * pt[0], pt[1]]
    let G: Vec2 = [Math.min(1, xl[0]), clamp(xl[1], 0, this.ph)]
    const shift = Math.max(0, 0.6 - G[0])
    G = [G[0] + shift, G[1]]
    if (this.isHard(dir)) {
      this.flip = { dir, hard: true, t: 0, grab: Math.max(0.45, G[0] - shift) }
    } else {
      const C: Vec2 = [1, G[1] < this.ph / 2 ? 0 : this.ph]
      this.flip = { dir, hard: false, C, P: [C[0], C[1]] }
    }
    const now = performance.now()
    this.drag = {
      dir,
      G,
      shift,
      start: screen,
      startPt: pt,
      t0: now,
      samples: [[now, xl[0]]],
      moved: false,
      tapY: hit.y,
    }
    this.mode = 'drag'
    this.updateFromDrag(xl)
  }

  private updateFromDrag(xl: Vec2) {
    const f = this.flip
    const d = this.drag
    if (!f || !d) return
    if (f.hard) {
      f.t = Math.acos(clamp(xl[0] / f.grab, -1, 1))
      return
    }
    const res = foldFromGrab(d.G, [xl[0] + d.shift, xl[1]], f.C, this.ph)
    if (res) {
      f.C = res.C
      f.P = res.P
    } else {
      f.P = [f.C[0], f.C[1]]
    }
  }

  moveDrag(pt: Vec2, screen: Vec2) {
    const d = this.drag
    if (!d) return
    const xl: Vec2 = [d.dir * pt[0], pt[1]]
    const now = performance.now()
    d.samples.push([now, xl[0]])
    while (d.samples.length > 2 && now - d.samples[0][0] > VELOCITY_WINDOW_MS) d.samples.shift()
    if (Math.hypot(screen[0] - d.start[0], screen[1] - d.start[1]) > TAP_MOVE_PX) d.moved = true
    this.updateFromDrag(xl)
  }

  /**
   * Lets go of the page. A quick press without movement is returned as a tap
   * (the page is laid flat again) so the caller can decide between a link and
   * a page turn.
   */
  endDrag(pt: Vec2 | null, cancelled: boolean): TapResult | null {
    const d = this.drag
    const f = this.flip
    if (!d) return null
    this.drag = null
    if (!f) {
      this.mode = 'idle'
      return null
    }
    const dt = performance.now() - d.t0
    if (!cancelled && !d.moved && dt < TAP_MS) {
      this.queue.length = 0
      this.flip = null
      this.mode = 'idle'
      return { dir: d.dir, x: d.startPt[0], y: d.tapY }
    }

    let v = 0
    const s = d.samples
    if (s.length > 1) {
      const span = (s[s.length - 1][0] - s[0][0]) / 1000
      if (span > 0.001) v = (s[s.length - 1][1] - s[0][1]) / span
    }
    const flat = f.hard ? f.t < 1e-3 : Math.hypot(f.P[0] - f.C[0], f.P[1] - f.C[1]) < 1e-3
    // swiping across a page the "wrong" way still turns the book that way
    const dx = pt ? (pt[0] - d.startPt[0]) * d.dir : 0
    if (flat && !cancelled && dx > WRONG_WAY_SWIPE && this.canTurn(-d.dir as Dir)) {
      this.flip = null
      this.mode = 'idle'
      this.tapTurn(-d.dir as Dir, this.ph)
      return null
    }
    const past = f.hard ? f.t > Math.PI / 2 : f.P[0] < 0.05
    const complete =
      !cancelled && (v < -FLICK_VELOCITY || (v < FLICK_VELOCITY && past))
    this.startAnim(complete)
    return null
  }
}

export function useFlipEngine(pageCount: number, pageAspect: number) {
  const [index, setIndex] = useState(0)
  const [engine] = useState(() => new FlipEngine(pageCount, pageAspect, setIndex))

  const next = useCallback(() => engine.turn(1), [engine])
  const prev = useCallback(() => engine.turn(-1), [engine])
  const goTo = useCallback((page: number) => engine.goTo(page), [engine])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) {
        e.preventDefault()
        engine.turn(1)
      } else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) {
        e.preventDefault()
        engine.turn(-1)
      } else if (k === 'Home') {
        e.preventDefault()
        engine.goTo(0)
      } else if (k === 'End') {
        e.preventDefault()
        engine.goTo(engine.count)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])

  return {
    engine,
    index,
    canGoNext: index < pageCount,
    canGoPrev: index > 0,
    next,
    prev,
    goTo,
  }
}
