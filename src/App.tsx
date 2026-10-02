import { useMemo } from 'react'
import leadersData from './data/attendees.json'
import organizersData from './data/organizers.json'
import type { Attendee } from './types/attendee'
import { BookScene } from './components/BookScene'
import { Controls } from './components/Controls'
import { useBookNavigation } from './hooks/useBookNavigation'
import { buildBookLayout } from './utils/bookLayout'
import './styles.css'

function App() {
  const layout = useMemo(
    () => buildBookLayout(leadersData as Attendee[], organizersData as Attendee[]),
    [],
  )
  const pageCount = layout.length
  const nav = useBookNavigation(pageCount)

  return (
    <div className="app-shell">
      <div className="canvas-wrap">
        <BookScene
          layout={layout}
          flippedCount={nav.flippedCount}
          isJumping={nav.isJumping}
          onNext={nav.next}
          onPrev={nav.prev}
          onGoTo={nav.goTo}
          onFlipComplete={nav.completeAnimation}
        />
      </div>
      <Controls
        layout={layout}
        flippedCount={nav.visibleCount}
        pageCount={pageCount}
        canGoNext={nav.canGoNext}
        canGoPrev={nav.canGoPrev}
        isAnimating={nav.isAnimating}
        onNext={nav.next}
        onPrev={nav.prev}
        onGoTo={nav.goTo}
      />
    </div>
  )
}

export default App
