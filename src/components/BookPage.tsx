import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FlipEngine } from '../hooks/useFlipEngine'
import { boardPoint, curlPoint, curlRadius, foldOf, smoothstep, clamp } from '../utils/pageFold'

export const PAGE_WIDTH = 1.6
export const PAGE_HEIGHT = 2.0
export const PAGE_ASPECT = PAGE_HEIGHT / PAGE_WIDTH
const SEGMENTS_X = 32
const SEGMENTS_Y = 40
const SHEET_GAP = 0.01

type Side = 'L' | 'R'

/** Resting depth of a sheet: whichever stack it lies on, sheets nearer the open spread sit higher. */
function sheetZ(index: number, total: number, side: Side) {
  const level = side === 'R' ? total - 1 - index : index
  return (level - total / 2) * SHEET_GAP
}

type BookPageProps = {
  frontMap: THREE.Texture
  backMap: THREE.Texture
  index: number
  totalPages: number
  engine: FlipEngine
}

/**
 * Front and back share one deforming grid. The front renders only its
 * front faces; once the sheet lies mirrored on the left its winding flips
 * and the back mesh (x-mirrored UVs, BackSide) shows instead.
 */
function createSheetGeometries() {
  const front = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, SEGMENTS_X, SEGMENTS_Y)
  front.translate(PAGE_WIDTH / 2, 0, 0)
  const back = new THREE.BufferGeometry()
  back.setIndex(front.index)
  back.setAttribute('position', front.attributes.position)
  back.setAttribute('normal', front.attributes.normal)
  const uv = (front.attributes.uv as THREE.BufferAttribute).clone()
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i))
  back.setAttribute('uv', uv)

  const pos = front.attributes.position as THREE.BufferAttribute
  const u = new Float32Array(pos.count)
  const v = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    u[i] = pos.getX(i) / PAGE_WIDTH
    v[i] = (PAGE_HEIGHT / 2 - pos.getY(i)) / PAGE_WIDTH
  }
  return { front, back, u, v }
}

export function BookPage({ frontMap, backMap, index, totalPages, engine }: BookPageProps) {
  const sheet = useMemo(() => createSheetGeometries(), [])
  const frontRef = useRef<THREE.Mesh>(null)
  const lastPose = useRef<string>('')

  useEffect(
    () => () => {
      sheet.front.dispose()
      sheet.back.dispose()
    },
    [sheet],
  )

  useFrame(() => {
    const front = frontRef.current?.geometry
    if (!front) return
    const { u, v } = sheet
    const pos = front.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const W = PAGE_WIDTH
    const top = PAGE_HEIGHT / 2
    const flip = engine.flip

    if (engine.turningSheet() !== index || !flip) {
      const side: Side = engine.sideOf(index)
      if (lastPose.current === side) return
      lastPose.current = side
      const sx = side === 'R' ? 1 : -1
      const z = sheetZ(index, totalPages, side)
      for (let i = 0; i < pos.count; i++) {
        arr[i * 3] = sx * u[i] * W
        arr[i * 3 + 1] = top - v[i] * W
        arr[i * 3 + 2] = z
      }
    } else {
      lastPose.current = 'turning'
      const s = flip.dir
      const zFrom = sheetZ(index, totalPages, s > 0 ? 'R' : 'L')
      const zTo = sheetZ(index, totalPages, s > 0 ? 'L' : 'R')

      if (flip.hard) {
        const along = flip.t / Math.PI
        const zBase = zFrom + (zTo - zFrom) * along
        const p: [number, number] = [0, 0]
        for (let i = 0; i < pos.count; i++) {
          boardPoint(u[i], flip.t, p)
          arr[i * 3] = s * p[0] * W
          arr[i * 3 + 1] = top - v[i] * W
          arr[i * 3 + 2] = zBase + p[1] * W
        }
      } else {
        const fold = foldOf(flip.C, flip.P)
        const r = fold ? curlRadius(fold.len) : 0
        // the folded flap rides above both stacks, settling onto the far one as it lands
        const above = Math.max(zFrom, zTo) + SHEET_GAP
        const settle = smoothstep(clamp((engine.progress() - 0.85) / 0.15, 0, 1))
        const zFlap = above + (zTo - above) * settle
        const p: [number, number, number, number] = [0, 0, 0, 0]
        for (let i = 0; i < pos.count; i++) {
          if (fold) curlPoint(u[i], v[i], fold, r, p)
          else {
            p[0] = u[i]
            p[1] = v[i]
            p[2] = 0
            p[3] = 0
          }
          arr[i * 3] = s * p[0] * W
          arr[i * 3 + 1] = top - p[1] * W
          arr[i * 3 + 2] = zFrom + (zFlap - zFrom) * p[3] + p[2] * W
        }
      }
    }
    pos.needsUpdate = true
    front.computeVertexNormals()
  })

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
        side: THREE.BackSide,
      }),
    [backMap],
  )

  return (
    <group>
      <mesh ref={frontRef} geometry={sheet.front} material={frontMat} frustumCulled={false} castShadow receiveShadow />
      <mesh geometry={sheet.back} material={backMat} frustumCulled={false} castShadow receiveShadow />
    </group>
  )
}
