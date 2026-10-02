import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { BookPageSpec } from '../utils/bookLayout'
import {
  createAttendeePageTexture,
  createBlankPageTexture,
  createCoverTexture,
  createIndexPageTexture,
  paintPage,
  type PageHotspot,
} from '../utils/createPageTexture'

function canvasToTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

export type PageSheet = {
  id: string
  frontMap: THREE.Texture
  backMap: THREE.Texture
  hotspots: PageHotspot[]
  setHovered: (hotspot: PageHotspot | undefined) => void
}

function createInteractiveFront(base: HTMLCanvasElement, hotspots: PageHotspot[]) {
  const display = document.createElement('canvas')
  display.width = base.width
  display.height = base.height
  paintPage(display, base, hotspots)
  const texture = canvasToTexture(display)

  let current: PageHotspot | undefined
  const setHovered = (hotspot: PageHotspot | undefined) => {
    if (hotspot === current) return
    current = hotspot
    paintPage(display, base, hotspots, hotspot)
    texture.needsUpdate = true
  }

  return { texture, setHovered }
}

const INDEX_COPY = {
  leaders: {
    title: 'Leaders',
    subtitle: 'Index  ·  tap a name to jump to their page',
    empty: 'Leaders coming soon',
  },
  organizers: {
    title: 'Organizers',
    subtitle: 'Index  ·  tap a name to jump to their page',
    empty: 'Organizer details coming soon',
  },
} as const

async function buildFront(
  spec: BookPageSpec,
  pageNumber: number,
): Promise<{ canvas: HTMLCanvasElement; hotspots: PageHotspot[] }> {
  switch (spec.kind) {
    case 'cover':
      return {
        canvas: createCoverTexture('TLC Scrapbook', 'Approved Attendees'),
        hotspots: [],
      }
    case 'index': {
      const copy = INDEX_COPY[spec.section]
      return createIndexPageTexture(
        copy.title,
        copy.subtitle,
        spec.entries,
        copy.empty,
        pageNumber,
      )
    }
    case 'person':
      return createAttendeePageTexture(spec.person, pageNumber)
  }
}

export function useScrapbookPages(layout: BookPageSpec[]) {
  const [sheets, setSheets] = useState<PageSheet[] | null>(null)

  useEffect(() => {
    let cancelled = false

    async function build() {
      const built: PageSheet[] = []
      for (let i = 0; i < layout.length; i++) {
        const spec = layout[i]
        const front = await buildFront(spec, i)
        const { texture, setHovered } = createInteractiveFront(front.canvas, front.hotspots)
        built.push({
          id: spec.id,
          frontMap: texture,
          backMap: canvasToTexture(createBlankPageTexture()),
          hotspots: front.hotspots,
          setHovered,
        })
      }

      if (cancelled) return
      setSheets(built)
    }

    void build()
    return () => {
      cancelled = true
    }
  }, [layout])

  return sheets
}
