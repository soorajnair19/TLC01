import { useEffect, useState } from 'react'
import * as THREE from 'three'
import type { BookPageSpec } from '../utils/bookLayout'
import {
  LINKEDIN_HIT_AREA,
  createAttendeePageTexture,
  createBlankPageTexture,
  createCoverTexture,
  createIndexPageTexture,
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
    case 'back-cover':
      return {
        canvas: createCoverTexture('Thank You', 'Until we meet again'),
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
    case 'person': {
      const canvas = await createAttendeePageTexture(spec.person, pageNumber)
      const hotspots: PageHotspot[] = spec.person.linkedin
        ? [{ ...LINKEDIN_HIT_AREA, action: { kind: 'url', href: spec.person.linkedin } }]
        : []
      return { canvas, hotspots }
    }
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
        built.push({
          id: spec.id,
          frontMap: canvasToTexture(front.canvas),
          backMap: canvasToTexture(createBlankPageTexture()),
          hotspots: front.hotspots,
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
