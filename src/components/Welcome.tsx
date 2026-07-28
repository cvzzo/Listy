import { useEffect, useState } from 'react'
import './Welcome.css'

const VIEW_WIDTH = 320
const VIEW_HEIGHT = 120
const FONT_SIZE = 92
const DOT_RADIUS = 3.2
const GRID_STEP = 6
const STAGGER_MS = 2.6
const DOT_DURATION_MS = 380
const HOLD_MS = 500
const FADE_OUT_MS = 400
const SAFETY_TIMEOUT_MS = 3000

type Dot = { x: number; y: number; delay: number }

function sampleTextDots(text: string): Dot[] {
  const canvas = document.createElement('canvas')
  canvas.width = VIEW_WIDTH
  canvas.height = VIEW_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  ctx.fillStyle = '#000'
  ctx.font = `900 ${FONT_SIZE}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, VIEW_WIDTH / 2, VIEW_HEIGHT / 2)

  const { data } = ctx.getImageData(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  const points: { x: number; y: number }[] = []
  for (let y = 0; y < VIEW_HEIGHT; y += GRID_STEP) {
    for (let x = 0; x < VIEW_WIDTH; x += GRID_STEP) {
      const alpha = data[(y * VIEW_WIDTH + x) * 4 + 3]
      if (alpha > 128) points.push({ x, y })
    }
  }

  // Ordina da sinistra a destra per dare l'impressione di una scritta che si compone
  points.sort((a, b) => a.x - b.x || a.y - b.y)

  return points.map((p, i) => ({ x: p.x, y: p.y, delay: i * STAGGER_MS }))
}

function Welcome({ onFinish }: { onFinish: () => void }) {
  const [dots] = useState<Dot[]>(() => sampleTextDots('Listy'))
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      onFinish()
      return
    }

    const lastDelay = dots.length ? dots[dots.length - 1].delay : 0
    const buildDuration = lastDelay + DOT_DURATION_MS

    const fadeTimer = setTimeout(() => setFadingOut(true), buildDuration + HOLD_MS)
    const finishTimer = setTimeout(
      onFinish,
      Math.min(buildDuration + HOLD_MS + FADE_OUT_MS, SAFETY_TIMEOUT_MS),
    )

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(finishTimer)
    }
  }, [dots, onFinish])

  return (
    <div className={`welcome ${fadingOut ? 'welcome-fade-out' : ''}`}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="welcome-svg"
        role="img"
        aria-label="Listy"
      >
        <defs>
          <linearGradient id="welcome-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4a9e6a" />
            <stop offset="100%" stopColor="#2f7d4f" />
          </linearGradient>
        </defs>
        {dots.map((dot, i) => (
          <circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={DOT_RADIUS}
            className="welcome-dot"
            style={{ animationDelay: `${dot.delay}ms` }}
          />
        ))}
      </svg>
    </div>
  )
}

export default Welcome
