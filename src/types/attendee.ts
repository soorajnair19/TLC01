export interface Attendee {
  id: string
  name: string
  designation: string
  organization: string
  linkedin: string
  intro: string
  /** Filename under /public/photos/ — omit or leave empty to use initials fallback */
  photo?: string
}
