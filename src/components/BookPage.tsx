import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useSpring, animated } from '@react-spring/three'
import * as THREE from 'three'
import {
  findHotspotFromUv,
  type HotspotAction,
  type PageHotspot,
} from '../utils/createPageTexture'

export const PAGE_WIDTH = 1.6
export const PAGE_HEIGHT = 2.0
export const PAGE_SEGMENTS = 24

type BookPageProps = {
  frontMap: THREE.Texture
  backMap: THREE.Texture
  index: number
  flipped: boolean
  totalPages: number
  fast?: boolean
  hotspots?: PageHotspot[]
  onHotspot?: (action: HotspotAction) => void
  onClickPage?: () => void
  onFlipSettled?: () => void
}

const CLICK_DRAG_TOLERANCE_PX = 6

function createPageGeometry() {
  const geo = new THREE.PlaneGeometry(
    PAGE_WIDTH,
    PAGE_HEIGHT,
    PAGE_SEGMENTS,
    1,
  )
  geo.translate(PAGE_WIDTH / 2, 0, 0)
  return geo
}

export function BookPage({
  frontMap,
  backMap,
  index,
  flipped,
  totalPages,
  fast = false,
  hotspots,
  onHotspot,
  onClickPage,
  onFlipSettled,
}: BookPageProps) {
  const groupRef = useRef<THREE.Group>(null)
  const frontRef = useRef<THREE.Mesh>(null)
  const backRef = useRef<THREE.Mesh>(null)
  const basePositions = useRef<Float32Array | null>(null)
  const flippedRef = useRef(flipped)
  const shouldNotifySettleRef = useRef(false)
  const onFlipSettledRef = useRef(onFlipSettled)

  const frontGeo = useMemo(() => createPageGeometry(), [])
  const backGeo = useMemo(() => createPageGeometry(), [])

  useEffect(() => {
    const pos = frontGeo.attributes.position
    basePositions.current = new Float32Array(pos.array as Float32Array)
  }, [frontGeo])

  useEffect(() => {
    onFlipSettledRef.current = onFlipSettled
  }, [onFlipSettled])

  useEffect(() => {
    if (flippedRef.current !== flipped) {
      shouldNotifySettleRef.current = true
      flippedRef.current = flipped
    }
  }, [flipped])

  const { open } = useSpring({
    open: flipped ? 1 : 0,
    config: fast
      ? { mass: 1, tension: 280, friction: 28, clamp: true }
      : { mass: 1.05, tension: 175, friction: 24, clamp: true },
    onRest: () => {
      if (!shouldNotifySettleRef.current) return
      shouldNotifySettleRef.current = false
      onFlipSettledRef.current?.()
    },
  })

  useEffect(() => {
    let frame = 0
    const applyCurl = (mesh: THREE.Mesh | null, base: Float32Array, o: number) => {
      if (!mesh) return
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      for (let i = 0; i < pos.count; i++) {
        const ix = i * 3
        const x = base[ix]
        const y = base[ix + 1]
        const t = x / PAGE_WIDTH
        const curl = Math.sin(o * Math.PI) * t * t * 0.22
        const fold = Math.sin(o * Math.PI) * (1 - t) * 0.04
        arr[ix] = x
        arr[ix + 1] = y + fold
        arr[ix + 2] = curl
      }
      pos.needsUpdate = true
      mesh.geometry.computeVertexNormals()
    }

    const tick = () => {
      const o = open.get()
      const base = basePositions.current
      if (base) {
        applyCurl(frontRef.current, base, o)
        applyCurl(backRef.current, base, o)
      }
      if (groupRef.current) {
        const frontStackZ = -index * 0.012
        const backStackZ = -(totalPages - index) * 0.012
        // Keep sheet depth aligned with flip progress so the page does not
        // jump stacks at animation start/end.
        groupRef.current.position.z = frontStackZ + (backStackZ - frontStackZ) * o
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [open, flipped, index, totalPages])

  const frontMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: frontMap,
        roughness: 0.88,
        metalness: 0.02,
        side: THREE.FrontSide,
      }),
    [frontMap],
  )

  const backMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: backMap,
        roughness: 0.88,
        metalness: 0.02,
        side: THREE.FrontSide,
      }),
    [backMap],
  )

  const hotspotAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (flipped || !hotspots?.length || !e.uv) return undefined
    return findHotspotFromUv(hotspots, e.uv.x, e.uv.y)
  }

  const handleFrontClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE_PX) return
    const hit = hotspotAt(e)
    if (hit) {
      onHotspot?.(hit.action)
      return
    }
    onClickPage?.()
  }

  const handleFrontPointerMove = (e: ThreeEvent<PointerEvent>) => {
    document.body.style.cursor = hotspotAt(e) ? 'pointer' : ''
  }

  const handleFrontPointerOut = () => {
    document.body.style.cursor = ''
  }

  const handleBackClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE_PX) return
    onClickPage?.()
  }

  return (
    <animated.group
      ref={groupRef}
      rotation-y={open.to((o) => -o * Math.PI - Math.sin(o * Math.PI) * 0.09)}
      position-y={open.to((o) => Math.sin(o * Math.PI) * 0.02)}
    >
      <mesh
        ref={frontRef}
        geometry={frontGeo}
        material={frontMat}
        castShadow
        receiveShadow
        onClick={handleFrontClick}
        onPointerMove={handleFrontPointerMove}
        onPointerOut={handleFrontPointerOut}
      />
      <mesh
        ref={backRef}
        geometry={backGeo}
        material={backMat}
        position={[PAGE_WIDTH, 0, -0.001]}
        rotation={[0, Math.PI, 0]}
        castShadow
        receiveShadow
        onClick={handleBackClick}
      />
    </animated.group>
  )
}
