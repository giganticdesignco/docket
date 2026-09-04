// Things falling over the whole window, a few seconds, then gone. No
// library: one canvas and a few hundred shapes. confetti() is paper;
// rain() is dollar signs, for "make it rain".
function burst(draw: (ctx: CanvasRenderingContext2D, p: Particle, s: number) => void, make: (w: number, h: number) => Particle, count: number, seconds: number) {
  if (typeof document === 'undefined') return
  const c = document.createElement('canvas')
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
  c.width = window.innerWidth
  c.height = window.innerHeight
  document.body.appendChild(c)
  const ctx = c.getContext('2d')
  if (!ctx) return c.remove()
  const ps = Array.from({ length: count }, () => make(c.width, c.height))
  const t0 = performance.now()
  const step = (t: number) => {
    const s = (t - t0) / 1000
    ctx.clearRect(0, 0, c.width, c.height)
    for (const p of ps) {
      p.vy += p.g
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.99
      p.a += p.va
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.a)
      ctx.globalAlpha = Math.max(0, 1 - s / seconds)
      draw(ctx, p, s)
      ctx.restore()
    }
    if (s < seconds) requestAnimationFrame(step)
    else c.remove()
  }
  requestAnimationFrame(step)
}
type Particle = { x: number, y: number, vx: number, vy: number, g: number, r: number, a: number, va: number, color: string }
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!

export function confetti(count = 180) {
  const colors = ['#00ba73', '#ff004c', '#ffb800', '#00a3ff', '#a855f7', '#ffffff']
  burst(
    (ctx, p) => { ctx.fillStyle = p.color; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r) },
    (w, h) => ({ x: w / 2 + (Math.random() - 0.5) * 240, y: h * 0.55, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 18 - 6, g: 0.45, r: Math.random() * 6 + 3, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3, color: pick(colors) }),
    count, 3,
  )
}

export function rain(count = 90) {
  burst(
    (ctx, p) => { ctx.fillStyle = p.color; ctx.font = `bold ${p.r * 4}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillText('$', 0, 0) },
    (w) => ({ x: Math.random() * w, y: -Math.random() * 600 - 20, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 3 + 2, g: 0.08, r: Math.random() * 5 + 4, a: (Math.random() - 0.5) * 0.4, va: (Math.random() - 0.5) * 0.04, color: pick(['#00ba73', '#0a8f5a', '#2ecc71']) }),
    count, 5,
  )
}
