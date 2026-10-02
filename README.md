# TLC Scrapbook

Interactive 3D attendee scrapbook built with React, Vite, Three.js, and React Three Fiber. Flip pages one-by-one to browse approved attendees.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build
npm run preview
```

## Controls

- **Tap a name** in the Leaders or Organizers index to jump to that page
- **Leaders / Organizers** buttons jump back to either index
- **Next / Previous** buttons
- **Arrow keys** (and Space for next)
- **Click** a page stack, or **drag left/right** on the book
- Orbit the camera with mouse drag on empty space; scroll to zoom

## Book order

Cover → Leaders index → Organizers index → leader pages → organizer pages → back cover.
Names in both indexes are clickable and flip through to that person's page. Page order is defined in [`src/utils/bookLayout.ts`](src/utils/bookLayout.ts).

## Update attendees

Leaders live in [`src/data/attendees.json`](src/data/attendees.json); organizers live in [`src/data/organizers.json`](src/data/organizers.json) (same entry shape). Only include people who should appear in the book. Index page numbers update automatically.

Each entry:

```json
{
  "id": "jane-doe",
  "name": "Jane Doe",
  "designation": "Design Lead",
  "organization": "Example Co",
  "linkedin": "https://www.linkedin.com/in/example/",
  "intro": "A short 2–4 sentence intro shown on the page and side panel.",
  "photo": "jane-doe.jpg"
}
```

## Photos

1. Put images in [`public/photos/`](public/photos/).
2. Match the `photo` filename in JSON (e.g. `jane-doe.jpg` → `public/photos/jane-doe.jpg`).
3. Prefer portraits around **800×1000** or similar portrait ratio.
4. If a file is missing, the page falls back to [`public/photos/placeholder.svg`](public/photos/placeholder.svg).

## Project structure

- `src/components/BookScene.tsx` — canvas, lights, camera, book assembly
- `src/components/BookPage.tsx` — page mesh + curl flip animation
- `src/components/AttendeeCardPage.tsx` — builds page textures from attendee data
- `src/components/Controls.tsx` — overlay UI + LinkedIn link
- `src/utils/createPageTexture.ts` — canvas drawing for covers and pages
- `src/hooks/useBookNavigation.ts` — one-page-at-a-time navigation state

## Notes

- LinkedIn opens from the side panel for reliable clicking.
- Page content (photo, name, role, org, intro, LinkedIn icon next to the name) is painted onto each page texture so it flips with the paper.
- Intros in the seed JSON are placeholders — replace them with real copy whenever ready.
