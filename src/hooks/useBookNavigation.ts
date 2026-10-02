import { useCallback, useEffect, useRef, useState } from 'react'

const FALLBACK_UNLOCK_MS = 2000
const JUMP_BUDGET_MS = 1500
const STEP_MIN_MS = 45
const STEP_MAX_MS = 150

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function useBookNavigation(pageCount: number) {
  const [flippedCount, setFlippedCount] = useState(0)
  const [visibleCount, setVisibleCount] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isJumping, setIsJumping] = useState(false)
  const flippedRef = useRef(0)
  const targetRef = useRef<number | null>(null)
  const lastMovedIndexRef = useRef<number | null>(null)
  const animatingRef = useRef(false)
  const stepTimerRef = useRef<number | null>(null)
  const fallbackRef = useRef<number | null>(null)

  const clearTimers = () => {
    if (stepTimerRef.current != null) {
      window.clearTimeout(stepTimerRef.current)
      stepTimerRef.current = null
    }
    if (fallbackRef.current != null) {
      window.clearTimeout(fallbackRef.current)
      fallbackRef.current = null
    }
  }

  const finish = useCallback(() => {
    if (!animatingRef.current) return
    const target = targetRef.current
    if (target == null) return
    targetRef.current = null
    lastMovedIndexRef.current = null
    animatingRef.current = false
    clearTimers()
    setVisibleCount(target)
    setIsAnimating(false)
    setIsJumping(false)
  }, [])

  /** Called by a page once its flip spring settles. */
  const completeAnimation = useCallback(
    (pageIndex: number) => {
      if (!animatingRef.current) return
      if (flippedRef.current !== targetRef.current) return
      if (pageIndex !== lastMovedIndexRef.current) return
      finish()
    },
    [finish],
  )

  const goTo = useCallback(
    (requested: number) => {
      const target = clamp(requested, 0, pageCount)
      if (animatingRef.current || target === flippedRef.current) return

      const distance = Math.abs(target - flippedRef.current)
      const direction = Math.sign(target - flippedRef.current)
      const stepMs = clamp(JUMP_BUDGET_MS / distance, STEP_MIN_MS, STEP_MAX_MS)

      animatingRef.current = true
      targetRef.current = target
      setIsAnimating(true)
      setIsJumping(distance > 1)
      clearTimers()

      const step = () => {
        const nextCount = flippedRef.current + direction
        lastMovedIndexRef.current = direction > 0 ? nextCount - 1 : nextCount
        flippedRef.current = nextCount
        setFlippedCount(nextCount)

        if (nextCount === target) {
          stepTimerRef.current = null
          // Failsafe only; normal unlock happens when the last page settles.
          fallbackRef.current = window.setTimeout(finish, FALLBACK_UNLOCK_MS)
          return
        }
        stepTimerRef.current = window.setTimeout(step, stepMs)
      }
      step()
    },
    [finish, pageCount],
  )

  useEffect(() => () => clearTimers(), [])

  const canGoNext = flippedCount < pageCount
  const canGoPrev = flippedCount > 0

  const next = useCallback(() => goTo(flippedRef.current + 1), [goTo])
  const prev = useCallback(() => goTo(flippedRef.current - 1), [goTo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  return {
    flippedCount,
    visibleCount,
    isAnimating,
    isJumping,
    canGoNext,
    canGoPrev,
    completeAnimation,
    goTo,
    next,
    prev,
  }
}
