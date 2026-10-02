import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadPeople(filename) {
  const full = path.join(root, 'src/data', filename)
  if (!existsSync(full)) return []
  return JSON.parse(readFileSync(full, 'utf8'))
}

const attendees = [...loadPeople('attendees.json'), ...loadPeople('organizers.json')]
const photosDir = path.join(root, 'public/photos')
const profileDir = path.join(root, '.linkedin-browser')

function normalizeProfileUrl(url) {
  const parsed = new URL(url.includes('://') ? url : `https://${url}`)
  parsed.hostname = 'www.linkedin.com'
  parsed.protocol = 'https:'
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/'
  return parsed.toString()
}

function isBlocked(url) {
  return /\/login|\/authwall|\/checkpoint|\/challenge|uas\/login/.test(url)
}

async function hasSession(context) {
  const cookies = await context.cookies('https://www.linkedin.com')
  return cookies.some((cookie) => cookie.name === 'li_at')
}

function savedWidth(file) {
  const info = execFileSync('sips', ['-g', 'pixelWidth', file], { encoding: 'utf8' })
  const match = info.match(/pixelWidth:\s*(\d+)/)
  return match ? Number(match[1]) : 0
}

function photoSize(url) {
  const match = url.match(/(?:shrink|scale|crop)_(\d+)_(\d+)/)
  if (!match) return 0
  return Math.min(Number(match[1]), Number(match[2]))
}

function bestPhotoUrl(urls) {
  const ranked = [...new Set(urls)]
    .filter((url) => url.includes('media.licdn.com') && /profile-displayphoto|profile-framedphoto/.test(url))
    .filter((url) => !/ghost|company-logo/.test(url))
    .sort((a, b) => photoSize(b) - photoSize(a))
  return ranked[0] || null
}

async function collectPhotoUrls(page) {
  return page.evaluate(() => {
    const records = []
    for (const img of document.querySelectorAll('img')) {
      const rect = img.getBoundingClientRect()
      for (const candidate of [img.currentSrc, img.src, img.getAttribute('srcset') || '']) {
        if (!candidate) continue
        for (const part of candidate.split(',')) {
          const url = part.trim().split(/\s+/)[0]
          if (url.includes('media.licdn.com')) records.push({ url, top: rect.top, area: rect.width * rect.height })
        }
      }
    }
    const portraits = records.filter(
      (record) => /profile-displayphoto/.test(record.url) && record.top >= 0 && record.top < 450,
    )
    const primary = (portraits.some((record) => record.area >= 64 * 64)
      ? portraits.filter((record) => record.area >= 64 * 64)
      : portraits
    ).sort((a, b) => b.area - a.area || a.top - b.top)[0]
    if (!primary) return records.map((record) => record.url)
    const id = (primary.url.match(/\/dms\/image\/(?:v2\/)?([^/]+)\//) || [])[1]
    if (!id) return [primary.url]
    const same = records.filter((record) => record.url.includes(id)).map((record) => record.url)
    return same.length ? same : [primary.url]
  })
}

async function openLargerPhoto(page) {
  const clicked = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')]
      .filter((node) => /profile-displayphoto|profile-framedphoto/.test(node.currentSrc || node.src || ''))
      .sort((a, b) => {
        const area = (node) => {
          const rect = node.getBoundingClientRect()
          return rect.width * rect.height
        }
        return area(b) - area(a)
      })[0]
    const target = img?.closest('button, a') || img
    if (!target) return false
    target.click()
    return true
  })
  if (!clicked) return
  await page.waitForTimeout(1_800)
}

async function downloadImage(context, url) {
  const response = await context.request.get(url, { timeout: 30_000 })
  if (!response.ok()) return null
  const type = response.headers()['content-type'] || ''
  if (!type.startsWith('image/')) return null
  const body = Buffer.from(await response.body())
  if (body.length < 1_500) return null
  return body
}

function saveJpeg(body, dest) {
  const tmp = `${dest}.download`
  writeFileSync(tmp, body)
  const isJpeg = body[0] === 0xff && body[1] === 0xd8
  if (isJpeg) {
    rmSync(dest, { force: true })
    execFileSync('mv', [tmp, dest])
    return
  }
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', tmp, '--out', dest])
  rmSync(tmp, { force: true })
}

async function waitForLogin(context, page) {
  console.log('Sign in to LinkedIn in the Chrome window. Waiting up to 8 minutes.')
  const start = Date.now()
  while (Date.now() - start < 8 * 60 * 1000) {
    if (await hasSession(context) && !isBlocked(page.url())) return
    await page.waitForTimeout(2_000)
  }
  throw new Error('Timed out waiting for a LinkedIn sign-in.')
}

async function main() {
  mkdirSync(photosDir, { recursive: true })
  const queue = attendees.filter((person) => person.photo && person.linkedin)

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 900 },
  })
  const page = context.pages()[0] || (await context.newPage())

  try {
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 45_000 })
    if (!(await hasSession(context)) || isBlocked(page.url())) {
      await waitForLogin(context, page)
    }
    console.log('Signed in. Saving portraits.')

    const saved = []
    const missed = []

    for (const person of queue) {
      const dest = path.join(photosDir, person.photo)
      if (existsSync(dest) && statSync(dest).size > 1_500 && savedWidth(dest) >= 400) {
        console.log(`skip ${person.name} (already saved)`)
        saved.push(person.photo)
        continue
      }

      const profileUrl = normalizeProfileUrl(person.linkedin)
      console.log(`open ${person.name}`)
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(2_500)
      if (isBlocked(page.url())) {
        await waitForLogin(context, page)
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await page.waitForTimeout(2_500)
      }
      if (isBlocked(page.url())) {
        throw new Error('LinkedIn blocked the session before the photos could be saved.')
      }

      let found = bestPhotoUrl(await collectPhotoUrls(page))
      for (let attempt = 0; attempt < 3 && (!found || photoSize(found) < 400); attempt += 1) {
        await page.waitForTimeout(1_500)
        await openLargerPhoto(page)
        const larger = bestPhotoUrl(await collectPhotoUrls(page))
        if (larger && photoSize(larger) > photoSize(found || '')) found = larger
      }
      if (!found) {
        console.log(`no photo ${person.name}`)
        missed.push(person.name)
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(800)
        continue
      }

      const body = await downloadImage(context, found)
      if (!body) {
        console.log(`download failed ${person.name}`)
        missed.push(person.name)
        continue
      }

      saveJpeg(body, dest)
      console.log(`saved ${person.photo} (${savedWidth(dest)}px, ${Math.round(statSync(dest).size / 1024)} KB)`)
      saved.push(person.photo)
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(1_200)
    }

    console.log(`Done. Saved ${saved.length}. Missing ${missed.length}${missed.length ? `: ${missed.join(', ')}` : ''}.`)
    if (missed.length) process.exitCode = 2
  } finally {
    await context.close()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
