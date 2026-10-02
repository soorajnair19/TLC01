import type { Attendee } from '../types/attendee'

const PAGE_W = 1024
const PAGE_H = 1280
const TEXT_X = 140
const TEXT_MAX_W = PAGE_W - 280
const LINKEDIN_ICON_SIZE = 46
const LINKEDIN_ICON_GAP = 18
// Must sit above the inner border drawn at PAGE_H - 60.
const PAGE_NUMBER_Y = PAGE_H - 84

const PAPER = '#DEDEDE'
const INK = '#045C34'
const MUTED = '#2C6C4D'
const ACCENT = '#045C34'
const RULE = '#8EB8A3'
const LINKEDIN_BLUE = '#0A66C2'
const INK_HOVER = '#000000'

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): { endX: number; baselineY: number } {
  const words = text.split(/\s+/)
  let line = ''
  let lineCount = 0
  let cursorY = y

  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY)
      line = words[i]
      cursorY += lineHeight
      lineCount++
      if (lineCount >= maxLines - 1) {
        let remaining = words.slice(i).join(' ')
        while (ctx.measureText(`${remaining}…`).width > maxWidth && remaining.length > 0) {
          remaining = remaining.slice(0, -1)
        }
        ctx.fillText(`${remaining}…`, x, cursorY)
        return { endX: x + ctx.measureText(`${remaining}…`).width, baselineY: cursorY }
      }
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, cursorY)
  return { endX: x + ctx.measureText(line).width, baselineY: cursorY }
}

function drawLinkedInIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, size * 0.18)
  ctx.fill()

  ctx.fillStyle = PAPER
  ctx.font = `700 ${Math.round(size * 0.66)}px "Helvetica Neue", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('in', x + size * 0.52, y + size * 0.8)
  ctx.restore()
}

function drawPaper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  // Soft paper grain
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * PAGE_W
    const y = Math.random() * PAGE_H
    const a = Math.random() * 0.05
    ctx.fillStyle = `rgba(4, 92, 52, ${a})`
    ctx.fillRect(x, y, 1.5, 1.5)
  }

  // Decorative border
  ctx.strokeStyle = RULE
  ctx.lineWidth = 3
  ctx.strokeRect(48, 48, PAGE_W - 96, PAGE_H - 96)
  ctx.strokeRect(60, 60, PAGE_W - 120, PAGE_H - 120)
}

function drawInitialsAvatar(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  const hue =
    [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360

  ctx.fillStyle = `hsl(${hue} 28% 42%)`
  ctx.beginPath()
  ctx.roundRect(x, y, size, size * 1.15, 18)
  ctx.fill()

  ctx.fillStyle = '#f5f5f5'
  ctx.font = `600 ${Math.floor(size * 0.28)}px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, x + size / 2, y + (size * 1.15) / 2)
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function createAttendeePageTexture(
  attendee: Attendee,
  pageNumber: number,
): Promise<{ canvas: HTMLCanvasElement; hotspots: PageHotspot[] }> {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  const ctx = canvas.getContext('2d')
  const hotspots: PageHotspot[] = []
  if (!ctx) return { canvas, hotspots }

  drawPaper(ctx)

  const photoX = 140
  const photoY = 120
  const photoW = 400
  const photoH = 460

  let drewPhoto = false
  if (attendee.photo) {
    const img = await loadImage(`/photos/${attendee.photo}`)
    if (img) {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(photoX, photoY, photoW, photoH, 16)
      ctx.clip()

      const scale = Math.max(photoW / img.width, photoH / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      const dx = photoX + (photoW - dw) / 2
      const dy = photoY + (photoH - dh) / 2
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.restore()
      drewPhoto = true
    }
  }

  if (!drewPhoto) {
    const placeholder = await loadImage('/photos/placeholder.svg')
    if (placeholder) {
      ctx.drawImage(placeholder, photoX, photoY, photoW, photoH)
    } else {
      drawInitialsAvatar(ctx, attendee.name, photoX, photoY, photoW)
    }
  }

  // Photo frame
  ctx.strokeStyle = '#8EB8A3'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(photoX - 4, photoY - 4, photoW + 8, photoH + 8, 18)
  ctx.stroke()

  // Text block
  const textX = TEXT_X
  let textY = photoY + photoH + 72

  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 54px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
  const nameMaxW = attendee.linkedin
    ? TEXT_MAX_W - LINKEDIN_ICON_SIZE - LINKEDIN_ICON_GAP
    : TEXT_MAX_W
  const nameEnd = wrapText(ctx, attendee.name, textX, textY, nameMaxW, 62, 2)

  if (attendee.linkedin) {
    const iconX = nameEnd.endX + LINKEDIN_ICON_GAP
    const iconY = nameEnd.baselineY - LINKEDIN_ICON_SIZE + 6
    const pad = 12
    hotspots.push({
      x: iconX - pad,
      y: iconY - pad,
      width: LINKEDIN_ICON_SIZE + pad * 2,
      height: LINKEDIN_ICON_SIZE + pad * 2,
      action: { kind: 'url', href: attendee.linkedin },
      draw: (c, hovered) =>
        drawLinkedInIcon(c, iconX, iconY, LINKEDIN_ICON_SIZE, hovered ? LINKEDIN_BLUE : ACCENT),
    })
  }

  textY += 78
  ctx.fillStyle = MUTED
  ctx.font = `500 28px "Avenir Next", "Segoe UI", sans-serif`
  wrapText(
    ctx,
    `${attendee.designation}  ·  ${attendee.organization}`,
    textX,
    textY,
    PAGE_W - 280,
    36,
    2,
  )

  textY += 78
  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(textX, textY)
  ctx.lineTo(textX + 120, textY)
  ctx.stroke()

  textY += 48
  ctx.fillStyle = INK
  ctx.font = `400 26px "Avenir Next", "Segoe UI", sans-serif`
  wrapText(ctx, attendee.intro, textX, textY, PAGE_W - 280, 38, 5)

  // Page number
  ctx.fillStyle = MUTED
  ctx.font = `400 20px "Avenir Next", "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(String(pageNumber), PAGE_W / 2, PAGE_NUMBER_Y)

  return { canvas, hotspots }
}

const COVER_SRC = '/cover.png'
const COVER_FRAME = '#d1d1d1'

export async function createCoverTexture(): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.fillStyle = COVER_FRAME
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  const img = await loadImage(COVER_SRC)
  if (!img) return canvas

  const scale = Math.min(PAGE_W / img.width, PAGE_H / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (PAGE_W - dw) / 2, (PAGE_H - dh) / 2, dw, dh)

  return canvas
}

export function createDividerTexture(title: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  ctx.fillStyle = PAPER
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 84px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
  ctx.fillText(title, PAGE_W / 2, PAGE_H / 2)

  return canvas
}

export function createBlankPageTexture(label = ''): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  drawPaper(ctx)
  if (label) {
    ctx.fillStyle = MUTED
    ctx.font = `400 24px "Avenir Next", "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(label, PAGE_W / 2, PAGE_H / 2)
  }
  return canvas
}

export type IndexEntry = {
  name: string
  page: number
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let trimmed = text
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return `${trimmed}…`
}

export function createIndexPageTexture(
  title: string,
  subtitle: string,
  entries: IndexEntry[],
  emptyMessage: string,
  pageNumber: number,
): { canvas: HTMLCanvasElement; hotspots: PageHotspot[] } {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  const ctx = canvas.getContext('2d')
  const hotspots: PageHotspot[] = []
  if (!ctx) return { canvas, hotspots }

  drawPaper(ctx)

  const left = 112
  const right = PAGE_W - 112

  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 64px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
  ctx.fillText(title, left, 190)

  ctx.fillStyle = MUTED
  ctx.font = `500 24px "Avenir Next", "Segoe UI", sans-serif`
  ctx.fillText(subtitle, left, 234)

  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left, 262)
  ctx.lineTo(left + 120, 262)
  ctx.stroke()

  if (entries.length === 0) {
    ctx.fillStyle = MUTED
    ctx.font = `italic 400 30px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
    ctx.textAlign = 'center'
    ctx.fillText(emptyMessage, PAGE_W / 2, PAGE_H / 2)
  } else {
    const columns = entries.length > 14 ? 2 : 1
    const gutter = 48
    const columnWidth = (right - left - gutter * (columns - 1)) / columns
    const rows = Math.ceil(entries.length / columns)
    const top = 300
    const bottom = PAGE_H - 110
    const rowHeight = Math.min(64, (bottom - top) / rows)
    const fontSize = Math.round(Math.min(29, rowHeight * 0.54))

    entries.forEach((entry, i) => {
      const col = Math.floor(i / rows)
      const row = i % rows
      const x = left + col * (columnWidth + gutter)
      const y = top + row * rowHeight
      const baseline = y + rowHeight / 2 + fontSize * 0.35

      ctx.font = `500 ${fontSize}px "Avenir Next", "Segoe UI", sans-serif`
      const pageLabel = String(entry.page)
      const pageWidth = ctx.measureText(pageLabel).width
      ctx.textAlign = 'right'
      ctx.fillStyle = MUTED
      ctx.fillText(pageLabel, x + columnWidth, baseline)

      const nameFont = `600 ${fontSize}px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
      ctx.font = nameFont
      const name = fitText(ctx, entry.name, columnWidth - pageWidth - 24)
      const nameWidth = ctx.measureText(name).width

      const dotsStart = x + nameWidth + 10
      const dotsEnd = x + columnWidth - pageWidth - 10
      ctx.fillStyle = RULE
      for (let dx = dotsStart; dx < dotsEnd; dx += 9) {
        ctx.fillRect(dx, baseline - 3, 2.5, 2.5)
      }

      hotspots.push({
        x,
        y,
        width: columnWidth,
        height: rowHeight,
        action: { kind: 'page', page: entry.page },
        draw: (c, hovered) => {
          c.font = nameFont
          c.textAlign = 'left'
          c.textBaseline = 'alphabetic'
          c.fillStyle = hovered ? INK_HOVER : INK
          c.fillText(name, x, baseline)
        },
      })
    })
  }

  ctx.fillStyle = MUTED
  ctx.font = `400 20px "Avenir Next", "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(String(pageNumber), PAGE_W / 2, PAGE_NUMBER_Y)

  return { canvas, hotspots }
}

export type HotspotAction =
  | { kind: 'url'; href: string }
  | { kind: 'page'; page: number }

/** Clickable rectangle in page-texture pixel coordinates. */
export type PageHotspot = {
  x: number
  y: number
  width: number
  height: number
  action: HotspotAction
  /** Paints the hotspot's visual; kept off the base canvas so it can be repainted on hover. */
  draw?: (ctx: CanvasRenderingContext2D, hovered: boolean) => void
}

export function paintPage(
  target: HTMLCanvasElement,
  base: HTMLCanvasElement,
  hotspots: PageHotspot[],
  hovered?: PageHotspot,
) {
  const ctx = target.getContext('2d')
  if (!ctx) return
  ctx.drawImage(base, 0, 0)
  for (const h of hotspots) {
    if (!h.draw) continue
    ctx.save()
    h.draw(ctx, h === hovered)
    ctx.restore()
  }
}

export const PAGE_TEXTURE_SIZE = { width: PAGE_W, height: PAGE_H }
export function findHotspotFromUv(
  hotspots: PageHotspot[],
  u: number,
  v: number,
): PageHotspot | undefined {
  const canvasX = u * PAGE_W
  const canvasY = (1 - v) * PAGE_H
  return hotspots.find(
    (h) =>
      canvasX >= h.x &&
      canvasX <= h.x + h.width &&
      canvasY >= h.y &&
      canvasY <= h.y + h.height,
  )
}
