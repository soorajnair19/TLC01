import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { FlipEngine } from '../hooks/useFlipEngine'
import type { BookPageSpec } from '../utils/bookLayout'
import { findHotspotFromUv, type HotspotAction, type PageHotspot } from '../utils/createPageTexture'
import type { Vec2 } from '../utils/pageFold'
import { type PageSheet, useScrapbookPages } from './AttendeeCardPage'
import { BookPage, PAGE_ASPECT, PAGE_HEIGHT, PAGE_WIDTH } from './BookPage'

type BookProps = {
  layout: BookPageSpec[]
  engine: FlipEngine
  onGoTo: (page: number) => void
}

function BookBase() {
  return (
    <mesh
      position={[0, -PAGE_HEIGHT / 2 - 0.06, 0]}
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[2.4, 48]} />
      <meshStandardMaterial color="#02301c" roughness={0.95} metalness={0} />
    </mesh>
  )
}

/**
 * Grabs pages with native pointer events on the canvas. Listening in the
 * capture phase lets a page grab claim the gesture before OrbitControls
 * sees it; anywhere off the book still orbits the camera.
 */
function useBookPointer(
  engine: FlipEngine,
  spreadRef: RefObject<THREE.Group | null>,
  controlsRef: RefObject<OrbitControlsImpl | null>,
  sheets: PageSheet[] | null,
  onHotspot: (action: HotspotAction) => void,
) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const sheetsRef = useRef(sheets)
  const onHotspotRef = useRef(onHotspot)

  useEffect(() => {
    sheetsRef.current = sheets
    onHotspotRef.current = onHotspot
  }, [sheets, onHotspot])

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane()
    const hitPoint = new THREE.Vector3()
    const normalMatrix = new THREE.Matrix3()
    let pointerId: number | null = null
    let hovered: { sheet: PageSheet; hotspot: PageHotspot } | null = null

    /** Pointer position on the spread, in page units (x signed from the spine, y down from the top). */
    const toPage = (clientX: number, clientY: number): Vec2 | null => {
      const spread = spreadRef.current
      if (!spread) return null
      const rect = el.getBoundingClientRect()
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      spread.updateWorldMatrix(true, false)
      plane.set(new THREE.Vector3(0, 0, 1), 0)
      plane.applyMatrix4(spread.matrixWorld, normalMatrix.getNormalMatrix(spread.matrixWorld))
      if (!raycaster.ray.intersectPlane(plane, hitPoint)) return null
      spread.worldToLocal(hitPoint)
      return [hitPoint.x / PAGE_WIDTH, (PAGE_HEIGHT / 2 - hitPoint.y) / PAGE_WIDTH]
    }

    const hotspotAt = (pt: Vec2) => {
      if (pt[0] < 0 || engine.index >= engine.count) return null
      const sheet = sheetsRef.current?.[engine.index]
      if (!sheet?.hotspots.length) return null
      const hotspot = findHotspotFromUv(sheet.hotspots, pt[0], 1 - pt[1] / PAGE_ASPECT)
      return hotspot ? { sheet, hotspot } : null
    }

    const setHovered = (next: typeof hovered) => {
      if (hovered?.hotspot === next?.hotspot) return
      hovered?.sheet.setHovered(undefined)
      next?.sheet.setHovered(next.hotspot)
      hovered = next
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (engine.dragging) return
      let pt = toPage(e.clientX, e.clientY)
      if (!pt || !engine.overBook(pt)) return
      if (engine.mode === 'anim') {
        engine.finishAnimNow()
        pt = toPage(e.clientX, e.clientY)
        if (!pt) return
      }
      const hit = engine.hitTest(pt)
      if (!hit) return
      e.preventDefault()
      e.stopImmediatePropagation()
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // capture is best effort; window-level moves still arrive while the button is held
      }
      pointerId = e.pointerId
      if (controlsRef.current) controlsRef.current.enabled = false
      setHovered(null)
      el.style.cursor = 'grabbing'
      engine.beginDrag(hit, pt, [e.clientX, e.clientY])
    }

    const onMove = (e: PointerEvent) => {
      if (pointerId != null) {
        if (e.pointerId !== pointerId) return
        const pt = toPage(e.clientX, e.clientY)
        if (pt) engine.moveDrag(pt, [e.clientX, e.clientY])
        return
      }
      if (e.pointerType !== 'mouse' || e.buttons) return
      const pt = engine.mode === 'idle' ? toPage(e.clientX, e.clientY) : null
      const spot = pt ? hotspotAt(pt) : null
      setHovered(spot)
      el.style.cursor = spot ? 'pointer' : pt && engine.hitTest(pt) ? 'grab' : ''
    }

    const release = (e: PointerEvent, cancelled: boolean) => {
      if (pointerId == null || e.pointerId !== pointerId) return
      pointerId = null
      if (controlsRef.current) controlsRef.current.enabled = true
      el.style.cursor = ''
      const pt = toPage(e.clientX, e.clientY)
      const tap = engine.endDrag(pt, cancelled)
      if (!tap) return
      const spot = tap.dir > 0 ? hotspotAt([tap.x, tap.y]) : null
      if (spot) onHotspotRef.current(spot.hotspot.action)
      else engine.tapTurn(tap.dir, tap.y < PAGE_ASPECT / 2 ? 0 : PAGE_ASPECT)
    }
    const onUp = (e: PointerEvent) => release(e, false)
    const onCancel = (e: PointerEvent) => release(e, true)
    const onLeave = () => {
      if (pointerId != null) return
      setHovered(null)
      el.style.cursor = ''
    }

    el.addEventListener('pointerdown', onDown, { capture: true })
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true })
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('pointerleave', onLeave)
      el.style.cursor = ''
    }
  }, [camera, gl, engine, spreadRef, controlsRef])
}

function ScrapbookBook({
  layout,
  engine,
  onGoTo,
  controlsRef,
}: BookProps & { controlsRef: RefObject<OrbitControlsImpl | null> }) {
  const sheets = useScrapbookPages(layout)
  const bookRef = useRef<THREE.Group>(null)
  const spreadRef = useRef<THREE.Group>(null)

  const handleHotspot = (action: HotspotAction) => {
    if (action.kind === 'url') {
      window.open(action.href, '_blank', 'noopener,noreferrer')
    } else {
      onGoTo(action.page)
    }
  }

  useBookPointer(engine, spreadRef, controlsRef, sheets, handleHotspot)

  // runs before the pages so they always draw the current frame's fold
  useFrame(() => {
    engine.step(performance.now())
    if (spreadRef.current) spreadRef.current.position.x = engine.restOffset() * PAGE_WIDTH
  }, -1)

  useFrame((state) => {
    if (!bookRef.current) return
    bookRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.02
  })

  const total = sheets?.length ?? 0

  const spine = useMemo(
    () => (
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.06, PAGE_HEIGHT + 0.02, 0.08]} />
        <meshStandardMaterial color="#045C34" roughness={0.65} />
      </mesh>
    ),
    [],
  )

  if (!sheets) {
    return (
      <mesh>
        <boxGeometry args={[PAGE_WIDTH * 2, PAGE_HEIGHT, 0.2]} />
        <meshStandardMaterial color="#045C34" />
      </mesh>
    )
  }

  return (
    <group ref={bookRef} rotation={[-0.18, 0.35, 0.04]}>
      <BookBase />
      <group ref={spreadRef}>
        {spine}
        {sheets.map((sheet, index) => (
          <BookPage
            key={sheet.id}
            index={index}
            totalPages={total}
            frontMap={sheet.frontMap}
            backMap={sheet.backMap}
            engine={engine}
          />
        ))}
      </group>
    </group>
  )
}

export function BookScene(props: BookProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.55, 5.4], fov: 35, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.15
      }}
    >
      <color attach="background" args={['#045C34']} />
      <fog attach="fog" args={['#045C34', 10, 22]} />

      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#DEDEDE', '#024127', 0.55]} />
      <directionalLight
        castShadow
        position={[4, 6, 4]}
        intensity={1.55}
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-4, 3, -2]} intensity={0.35} color="#bde3d1" />
      <pointLight position={[0, 2.5, 3]} intensity={0.3} color="#dedede" />

      <Suspense fallback={null}>
        <ScrapbookBook {...props} controlsRef={controlsRef} />
      </Suspense>

      <ContactShadows
        position={[0, -1.15, 0]}
        opacity={0.4}
        scale={12}
        blur={2.5}
        far={4}
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={3.5}
        maxDistance={8}
        target={[0, 0, 0]}
      />
    </Canvas>
  )
}
