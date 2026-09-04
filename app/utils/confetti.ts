// A burst of confetti over the whole window, three seconds, then gone.
// No library: one canvas, a few hundred rectangles, gravity.
export function confetti(count = 180) {
  if (typeof document === 'undefined') return
  const c = document.createElement('canvas')
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
  c.width = window.innerWidth
  c.height = window.innerHeight
  document.body.appendChild(c)
  const ctx = c.getContext('2d')
  if (!ctx) return c.remove()
  const colors = ['#00ba73', '#ff004c', '#ffb800', '#00a3ff', '#a855f7', '#ffffff']
  const ps = Array.from({ length: count }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * 240,
    y: c.height * 0.55,
    vx: (Math.random() - 0.5) * 18,
    vy: -Math.random() * 18 - 6,
    r: Math.random() * 6 + 3,
    a: Math.random() * Math.PI,
    va: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)]!,
  }))
  const t0 = performance.now()
  const step = (t: number) => {
    const s = (t - t0) / 1000
    ctx.clearRect(0, 0, c.width, c.height)
    for (const p of ps) {
      p.vy += 0.45
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.99
      p.a += p.va
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.a)
      ctx.globalAlpha = Math.max(0, 1 - s / 3)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r)
      ctx.restore()
    }
    if (s < 3) requestAnimationFrame(step)
    else c.remove()
  }
  requestAnimationFrame(step)
}
