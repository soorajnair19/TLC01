import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { BookPageSpec } from '../utils/bookLayout'
import type { HotspotAction } from '../utils/createPageTexture'
import { useScrapbookPages } from './AttendeeCardPage'
import { BookPage, PAGE_HEIGHT, PAGE_WIDTH } from './BookPage'

type BookProps = {
  layout: BookPageSpec[]
  flippedCount: number
  isJumping: boolean
  onNext: () => void
  onPrev: () => void
  onGoTo: (page: number) => void
  onFlipComplete: (pageIndex: number) => void
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

function ScrapbookBook({
  layout,
  flippedCount,
  isJumping,
  onNext,
  onPrev,
  onGoTo,
  onFlipComplete,
}: BookProps) {
  const sheets = useScrapbookPages(layout)
  const bookRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!bookRef.current) return
    bookRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.02
  })

  const drag = useRef<{ x: number; active: boolean }>({ x: 0, active: false })
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

  const handleHotspot = (action: HotspotAction) => {
    if (action.kind === 'url') {
      window.open(action.href, '_blank', 'noopener,noreferrer')
    } else {
      onGoTo(action.page)
    }
  }

  if (!sheets) {
    return (
      <mesh>
        <boxGeometry args={[PAGE_WIDTH * 2, PAGE_HEIGHT, 0.2]} />
        <meshStandardMaterial color="#045C34" />
      </mesh>
    )
  }

  return (
    <group
      ref={bookRef}
      rotation={[-0.18, 0.35, 0.04]}
      onPointerDown={(e) => {
        e.stopPropagation()
        drag.current = { x: e.clientX, active: true }
      }}
      onPointerUp={(e) => {
        if (!drag.current.active) return
        const dx = e.clientX - drag.current.x
        drag.current.active = false
        // Taps are handled by each page's click handler (so index links work).
        if (dx < -40) onNext()
        if (dx > 40) onPrev()
      }}
      onPointerLeave={() => {
        drag.current.active = false
      }}
    >
      <BookBase />
      {spine}
      {sheets.map((sheet, index) => (
        <BookPage
          key={sheet.id}
          index={index}
          totalPages={total}
          frontMap={sheet.frontMap}
          backMap={sheet.backMap}
          flipped={index < flippedCount}
          fast={isJumping}
          hotspots={sheet.hotspots}
          onHotspot={handleHotspot}
          onClickPage={() => {
            if (index < flippedCount) onPrev()
            else onNext()
          }}
          onFlipSettled={() => onFlipComplete(index)}
        />
      ))}
    </group>
  )
}

export function BookScene(props: BookProps) {
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
      />
      <directionalLight position={[-4, 3, -2]} intensity={0.35} color="#bde3d1" />
      <pointLight position={[0, 2.5, 3]} intensity={0.3} color="#dedede" />

      <Suspense fallback={null}>
        <ScrapbookBook {...props} />
      </Suspense>

      <ContactShadows
        position={[0, -1.15, 0]}
        opacity={0.4}
        scale={12}
        blur={2.5}
        far={4}
      />

      <OrbitControls
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
