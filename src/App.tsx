import { useMemo } from 'react'
import leadersData from './data/attendees.json'
import organizersData from './data/organizers.json'
import type { Attendee } from './types/attendee'
import { BookScene } from './components/BookScene'
import { PAGE_ASPECT } from './components/BookPage'
import { Controls } from './components/Controls'
import { useFlipEngine } from './hooks/useFlipEngine'
import { buildBookLayout } from './utils/bookLayout'
import './styles.css'

function App() {
  const layout = useMemo(
    () => buildBookLayout(leadersData as Attendee[], organizersData as Attendee[]),
    [],
  )
  const pageCount = layout.length
  const book = useFlipEngine(pageCount, PAGE_ASPECT)
  return (
    <div className="app-shell">
      <div className="canvas-wrap">
        <BookScene layout={layout} engine={book.engine} onGoTo={book.goTo} />
      </div>
      <Controls
        layout={layout}
        flippedCount={book.index}
        pageCount={pageCount}
        canGoNext={book.canGoNext}
        canGoPrev={book.canGoPrev}
        onNext={book.next}
        onPrev={book.prev}
        onGoTo={book.goTo}
      />
    </div>
  )
}

export default App
