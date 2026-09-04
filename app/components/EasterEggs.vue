<script setup lang="ts">
// The eggs themselves, mounted once for staff: the cheat code listener,
// the arcade and party classes on the page, and the overlays: a film
// credits roll, a flipping coin, a tumbling d20, and a text adventure.
const { party, arcade, effect, toggleArcade } = useEasterEggs()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { profile } = useCurrentUser()
const ws = await useWorkStatuses()
const route = useRoute()

// ---------- the cheat code ----------
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
let typed: string[] = []
const insertCoin = ref(false)
function onKey(e: KeyboardEvent) {
  // Escape always leaves an egg: an overlay first, then arcade, then
  // party. A real dialog keeps its own Escape.
  if (e.key === 'Escape') {
    if (effect.value) { effect.value = null; return }
    if (document.querySelector('[role=dialog]')) return
    if (arcade.value) { arcade.value = false; return }
    if (party.value) { party.value = false; return }
    return
  }
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  typed = [...typed, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-KONAMI.length)
  if (typed.length === KONAMI.length && typed.every((k, i) => k === KONAMI[i])) {
    typed = []
    toggleArcade()
    if (arcade.value) { insertCoin.value = true; setTimeout(() => { insertCoin.value = false }, 2600) }
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(party, v => document.documentElement.classList.toggle('party', v), { immediate: true })
watch(arcade, v => document.documentElement.classList.toggle('arcade', v), { immediate: true })

// ---------- the coin ----------
const coinHeads = ref(true)
const coinDone = ref(false)
watch(effect, (v) => {
  if (v !== 'coin') return
  coinHeads.value = Math.random() < 0.5
  coinDone.value = false
  setTimeout(() => { coinDone.value = true }, 1900)
})

// ---------- the d20 ----------
const dieFace = ref(1)
const dieResult = ref<number | null>(null)
let dieTimer: ReturnType<typeof setInterval> | null = null
watch(effect, (v) => {
  if (v !== 'd20') { if (dieTimer) { clearInterval(dieTimer); dieTimer = null } return }
  dieResult.value = null
  const result = 1 + Math.floor(Math.random() * 20)
  dieTimer = setInterval(() => { dieFace.value = 1 + Math.floor(Math.random() * 20) }, 70)
  setTimeout(() => {
    if (dieTimer) clearInterval(dieTimer)
    dieTimer = null
    dieFace.value = result
    dieResult.value = result
    if (result === 20) confetti(120)
  }, 1600)
})
const dieCaption = computed(() => dieResult.value === 20 ? 'Natural twenty. Bill the client double.' : dieResult.value === 1 ? 'Critical fail. Maybe tomorrow.' : dieResult.value ? 'A perfectly normal number.' : '')

// ---------- the adventure ----------
const lines = ref<string[]>([])
const cmd = ref('')
const advInput = ref<HTMLInputElement | null>(null)
const roomName = () => {
  const p = route.path
  return p === '/' ? 'the Home page' : p.startsWith('/tasks') ? 'the task list' : p.startsWith('/time') ? 'the timesheet' : p.startsWith('/planner') ? 'the Planner' : p.startsWith('/reports') ? 'the Reports room' : p.startsWith('/invoices') ? 'the Invoices vault' : `a page called ${p}`
}
watch(effect, async (v) => {
  if (v !== 'adventure') return
  lines.value = ['DOCKET ADVENTURE', `You are in ${roomName()}. It is quiet. Exits lead everywhere.`, 'Type HELP if you are new here.']
  await nextTick()
  advInput.value?.focus()
})
async function runCmd() {
  const raw = cmd.value.trim()
  cmd.value = ''
  if (!raw) return
  const w = raw.toLowerCase()
  lines.value.push(`> ${raw}`)
  const say = (s: string) => lines.value.push(s)
  if (w === 'xyzzy') say('Nothing happens.')
  else if (w === 'plugh') say('A hollow voice says "Plugh."')
  else if (w === 'help' || w === '?') say('Try LOOK, INVENTORY, TIMER, HELLO, XYZZY, or QUIT.')
  else if (w === 'look' || w === 'l') say(`You are in ${roomName()}. There is a rail to the west with small icons on it. Somewhere, a timer may be running.`)
  else if (w === 'inventory' || w === 'i') {
    const doneKeys = ws.statuses.value.filter(s => s.is_done).map(s => s.key)
    const { count } = await supabase.from('work_items').select('id', { count: 'exact', head: true }).eq('assignee_id', user.value?.sub ?? '').not('status', 'in', `(${doneKeys.join(',')})`)
    say(count ? `You are carrying ${count} open ${count === 1 ? 'task' : 'tasks'}. ${count > 5 ? 'They are heavy.' : 'Manageable.'}` : 'You are carrying nothing. Suspicious.')
  }
  else if (w === 'timer') {
    const { data } = await supabase.from('time_entries').select('id, notes, started_at').eq('user_id', user.value?.sub ?? '').not('started_at', 'is', null).is('ended_at', null).maybeSingle()
    say(data ? `A timer is running${data.notes ? ` on "${data.notes}"` : ''}. It has been running since ${stamp(data.started_at!)}. It does not stop for you.` : 'No timer is running. The silence is loud.')
  }
  else if (w === 'hello' || w === 'hi') say(`Hello, ${profile.value?.full_name?.split(' ')[0] ?? 'adventurer'}.`)
  else if (w === 'quit' || w === 'exit' || w === 'q') { effect.value = null; return }
  else if (w.startsWith('go ') || ['n', 's', 'e', 'w', 'north', 'south', 'east', 'west'].includes(w)) say('You wander for a while and end up where you started. Pages are like that.')
  else if (w.startsWith('take ') || w.startsWith('get ')) say('You cannot take that. It belongs to the client.')
  else say("I don't know that word.")
  await nextTick()
  const box = advInput.value?.parentElement?.previousElementSibling
  if (box) box.scrollTop = box.scrollHeight
}

// ---------- the credits ----------
const year = new Date().getFullYear()
const credits = ref<{ people: string[], hours: number, done: number } | null>(null)
watch(effect, async (v) => {
  if (v !== 'credits') return
  const doneKeys = ws.statuses.value.filter(s => s.is_done).map(s => s.key)
  const [{ data: people }, { data: roll }, { count }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('is_active', true).neq('role', 'client').order('full_name'),
    supabase.rpc('report_rollup', { p_from: `${year}-01-01`, p_to: `${year}-12-31` }).single(),
    supabase.from('work_items').select('id', { count: 'exact', head: true }).in('status', doneKeys),
  ])
  credits.value = { people: (people ?? []).map(p => p.full_name), hours: Number(roll?.hours ?? 0), done: count ?? 0 }
})
</script>

<template>
  <!-- Arcade: the coin-slot banner on the way in. The scanlines are CSS on html.arcade. -->
  <Transition name="fade">
    <div v-if="insertCoin" class="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 font-mono text-white">
      <div class="text-4xl font-bold tracking-[0.3em] text-[#00ba73] [text-shadow:0_0_12px_#00ba73]">PLAYER 1</div>
      <div class="mt-3 animate-pulse text-xl tracking-[0.4em]">READY</div>
      <div class="mt-8 text-xs tracking-[0.3em] text-white/60">30 LIVES ADDED</div>
    </div>
  </Transition>

  <!-- The coin -->
  <div v-if="effect === 'coin'" class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/50" @click="effect = null">
    <div class="coin" :class="coinHeads ? 'coin-heads' : 'coin-tails'">
      <div class="coin-face coin-front"><img src="/logo.svg" alt="" class="size-16"></div>
      <div class="coin-face coin-back">D</div>
    </div>
    <div class="mt-8 h-8 text-2xl font-semibold text-white" :class="coinDone ? '' : 'opacity-0'">{{ coinHeads ? 'Heads' : 'Tails' }}</div>
    <div class="mt-1 text-xs text-white/60" :class="coinDone ? '' : 'opacity-0'">Heads is the logo. Click anywhere to put it back.</div>
  </div>

  <!-- The d20 -->
  <div v-if="effect === 'd20'" class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/50" @click="effect = null">
    <div class="d20" :class="[dieResult ? 'd20-still' : 'd20-tumble', dieResult === 1 ? 'd20-crack' : '', dieResult === 20 ? 'd20-glow' : '']">
      <span class="d20-num">{{ dieFace }}</span>
    </div>
    <div class="mt-8 h-8 text-2xl font-semibold text-white" :class="dieResult ? '' : 'opacity-0'">You rolled {{ dieResult }}</div>
    <div class="mt-1 h-5 text-sm text-white/70">{{ dieCaption }}</div>
  </div>

  <!-- The adventure -->
  <div v-if="effect === 'adventure'" class="fixed bottom-4 left-4 z-[100] flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col rounded-md border border-[#00ba73]/40 bg-black font-mono text-sm text-[#7dffc4] shadow-2xl md:left-20">
    <div class="max-h-72 space-y-1 overflow-y-auto p-3">
      <div v-for="(l, i) in lines" :key="i" :class="l.startsWith('>') ? 'text-white' : i === 0 ? 'font-bold text-[#00ba73]' : ''">{{ l }}</div>
    </div>
    <div class="flex items-center gap-2 border-t border-[#00ba73]/30 px-3 py-2">
      <span class="text-white">&gt;</span>
      <input ref="advInput" v-model="cmd" class="w-full bg-transparent text-white outline-none placeholder:text-white/30" placeholder="what now?" autocomplete="off" spellcheck="false" @keydown.enter="runCmd" @keydown.esc="effect = null">
    </div>
  </div>

  <!-- The credits -->
  <div v-if="effect === 'credits'" class="fixed inset-0 z-[100] overflow-hidden bg-black text-white" @click="effect = null">
    <div v-if="credits" class="credits-roll mx-auto max-w-lg space-y-10 text-center">
      <div class="pt-[100vh]" />
      <img src="/logo.svg" alt="" class="mx-auto size-24">
      <div class="text-4xl font-semibold tracking-widest">DOCKET</div>
      <div class="text-sm uppercase tracking-[0.3em] text-white/60">A Gigantic Design Co. production</div>
      <div class="space-y-3 pt-6">
        <div class="text-xs uppercase tracking-[0.3em] text-white/50">Starring</div>
        <div v-for="p in credits.people" :key="p" class="text-lg">{{ p }}</div>
      </div>
      <div class="space-y-3 pt-6">
        <div class="text-xs uppercase tracking-[0.3em] text-white/50">Hours logged in {{ year }}</div>
        <div class="text-3xl font-semibold tabular-nums">{{ formatHours(credits.hours) }}</div>
        <div class="text-xs uppercase tracking-[0.3em] text-white/50">Tasks finished</div>
        <div class="text-3xl font-semibold tabular-nums">{{ credits.done.toLocaleString() }}</div>
      </div>
      <div class="space-y-3 pt-6">
        <div class="text-xs uppercase tracking-[0.3em] text-white/50">Directed by</div>
        <div class="text-lg">Luke David</div>
        <div class="text-xs uppercase tracking-[0.3em] text-white/50">Written with</div>
        <div class="text-lg">Claude</div>
      </div>
      <div class="pt-6 text-sm text-white/60">It replaced Harvest and ClickUp in September {{ year }}.</div>
      <div class="text-sm text-white/60">No timers were left running during the making of this app.</div>
      <div class="pb-[40vh] pt-10 text-xs text-white/40">Click anywhere to leave. There are a few more of these. One is older than the web.</div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* The coin: two faces, a long spin that ends on the side it landed. */
.coin { position: relative; width: 8rem; height: 8rem; transform-style: preserve-3d; animation: coin-flip 1.8s cubic-bezier(0.2, 0.8, 0.3, 1) forwards; }
.coin-heads { --coin-end: 1800deg; }
.coin-tails { --coin-end: 1980deg; }
.coin-face { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 9999px; backface-visibility: hidden; box-shadow: inset 0 0 0 6px rgba(0, 0, 0, 0.15); }
.coin-front { background: radial-gradient(circle at 35% 30%, #fff3c4, #f5c518 60%, #b8860b); }
.coin-back { background: radial-gradient(circle at 35% 30%, #fff3c4, #f5c518 60%, #b8860b); transform: rotateY(180deg); font-size: 3.5rem; font-weight: 800; color: #7a5a00; }
@keyframes coin-flip { from { transform: rotateY(0) translateY(-10rem); } 60% { transform: rotateY(calc(var(--coin-end) * 0.7)) translateY(4rem); } to { transform: rotateY(var(--coin-end)) translateY(0); } }

/* The d20: a twenty-sided shape, tumbling, then still. */
.d20 { display: grid; place-items: center; width: 9rem; height: 9rem; color: white; background: linear-gradient(135deg, #00ba73, #0a6e47); clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%); filter: drop-shadow(0 12px 20px rgba(0, 0, 0, 0.5)); }
.d20-num { font-size: 3rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.d20-tumble { animation: d20-tumble 0.35s linear infinite; }
.d20-still { animation: d20-land 0.4s ease-out; }
.d20-crack { animation: d20-shake 0.5s ease-in-out; filter: grayscale(0.6) drop-shadow(0 12px 20px rgba(0, 0, 0, 0.5)); }
.d20-glow { filter: drop-shadow(0 0 24px #00ba73); }
@keyframes d20-tumble { from { transform: rotate(0) scale(1); } 50% { transform: rotate(180deg) scale(1.15); } to { transform: rotate(360deg) scale(1); } }
@keyframes d20-land { from { transform: scale(1.3) rotate(-20deg); } to { transform: scale(1) rotate(0); } }
@keyframes d20-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-8px) rotate(-3deg); } 40%, 80% { transform: translateX(8px) rotate(3deg); } }

/* The credits: one slow scroll from the bottom of the screen to past the top. */
.credits-roll { animation: credits-roll 45s linear forwards; }
@keyframes credits-roll { from { transform: translateY(0); } to { transform: translateY(-100%); } }
</style>
