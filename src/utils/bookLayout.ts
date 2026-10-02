import type { Attendee } from '../types/attendee'

export type BookSection = 'leaders' | 'organizers'

export type BookPageSpec =
  | { kind: 'cover'; id: string; label: string }
  | {
      kind: 'index'
      id: string
      label: string
      section: BookSection
      entries: { name: string; page: number }[]
    }
  | { kind: 'divider'; id: string; label: string; title: string }
  | {
      kind: 'person'
      id: string
      label: string
      section: BookSection
      person: Attendee
    }

export const LEADERS_INDEX_PAGE = 1
export const ORGANIZERS_INDEX_PAGE = 2

/**
 * Page order: cover, leaders index, organizers index, leader pages,
 * an organizers divider, then organizer pages. People are sorted A–Z by name. Each entry is one sheet; its array position is
 * the page number shown in the indexes and used for navigation. Turning the last
 * page closes the book on the front cover.
 */
const byName = (a: Attendee, b: Attendee) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export function buildBookLayout(
  leaderList: Attendee[],
  organizerList: Attendee[],
): BookPageSpec[] {
  const leaders = [...leaderList].sort(byName)
  const organizers = [...organizerList].sort(byName)
  const firstLeaderPage = ORGANIZERS_INDEX_PAGE + 1
  const firstOrganizerPage = firstLeaderPage + leaders.length + 1

  const personPage = (person: Attendee, section: BookSection): BookPageSpec => ({
    kind: 'person',
    id: `${section}-${person.id}`,
    label: person.name,
    section,
    person,
  })

  return [
    { kind: 'cover', id: 'cover', label: 'Cover' },
    {
      kind: 'index',
      id: 'leaders-index',
      label: 'Leaders index',
      section: 'leaders',
      entries: leaders.map((p, i) => ({ name: p.name, page: firstLeaderPage + i })),
    },
    {
      kind: 'index',
      id: 'organizers-index',
      label: 'Organizers index',
      section: 'organizers',
      entries: organizers.map((p, i) => ({
        name: p.name,
        page: firstOrganizerPage + i,
      })),
    },
    ...leaders.map((p) => personPage(p, 'leaders')),
    { kind: 'divider', id: 'organizers-divider', label: 'Organizers', title: 'Organizers' },
    ...organizers.map((p) => personPage(p, 'organizers')),
  ]
}
