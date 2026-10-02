import {
  LEADERS_INDEX_PAGE,
  ORGANIZERS_INDEX_PAGE,
  type BookPageSpec,
} from '../utils/bookLayout'

type ControlsProps = {
  layout: BookPageSpec[]
  flippedCount: number
  pageCount: number
  canGoNext: boolean
  canGoPrev: boolean
  onNext: () => void
  onPrev: () => void
  onGoTo: (page: number) => void
}

export function Controls({
  layout,
  flippedCount,
  pageCount,
  canGoNext,
  canGoPrev,
  onNext,
  onPrev,
  onGoTo,
}: ControlsProps) {
  const label = layout[Math.min(flippedCount, layout.length - 1)]?.label ?? ''

  return (
    <div className="ui-overlay">
      <header className="brand-bar">
        <p className="brand">TLC Scrapbook</p>
        <p className="hint">Tap a name in the index · Tap or drag a page corner · Arrow keys</p>
      </header>

      <div className="nav-bar">
        <button
          type="button"
          className="nav-btn"
          onClick={() => onGoTo(LEADERS_INDEX_PAGE)}
          disabled={flippedCount === LEADERS_INDEX_PAGE}
        >
          Leaders
        </button>
        <button
          type="button"
          className="nav-btn"
          onClick={() => onGoTo(ORGANIZERS_INDEX_PAGE)}
          disabled={flippedCount === ORGANIZERS_INDEX_PAGE}
        >
          Organizers
        </button>
        <span className="page-index">{label}</span>
        <button
          type="button"
          className="nav-btn"
          onClick={onPrev}
          disabled={!canGoPrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="nav-btn"
          onClick={onNext}
          disabled={!canGoNext}
        >
          Next
        </button>
      </div>

      <span className="sr-only">
        Total sheets {pageCount}. The leaders and organizers indexes link to
        each person's page.
      </span>
    </div>
  )
}
