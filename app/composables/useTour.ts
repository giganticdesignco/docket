import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

// Walkthroughs that point at the real UI, one page at a time. Each tour
// runs once per person (profiles.tours_seen), can be skipped on any
// step, and can be replayed from the help menu. Steps whose element is
// not on the page right now are dropped, so a tour never points at
// nothing.
type Step = { el?: string, title: string, text: string }
type Tour = { id: string, title: string, match: (path: string) => boolean, admin?: boolean, steps: Step[] }

const TOURS: Tour[] = [
  {
    id: 'around',
    title: 'Getting around',
    match: () => true,
    steps: [
      { title: 'Welcome to Docket', text: 'Time, tasks, and billing in one place. This takes half a minute and you can skip it any time. Each page has its own short tour the first time you open it.' },
      { el: '[data-tour="rail"]', title: 'The rail', text: 'Hover to see labels. The top five are the everyday pages; More holds the rest.' },
      { el: '[data-tour="search"]', title: 'Search', text: 'Cmd+K from anywhere finds tasks, projects, clients, quotes, and invoices as you type.' },
      { el: '[data-tour="help"]', title: 'Help', text: 'Replay a tour or see the keyboard shortcuts for the page you are on. Press ? for the shortcuts any time.' },
      { el: '[data-tour="theme"]', title: 'Light or dark', text: 'Your choice, remembered on this browser.' },
    ],
  },
  {
    id: 'time',
    title: 'Logging time',
    match: p => p === '/time',
    steps: [
      { el: '[data-tour="week"]', title: 'Your week', text: 'Pick a day to see and add its entries. Arrow keys move a day; up and down move a week.' },
      { el: '[data-tour="pace"]', title: 'Your pace', text: 'Hours this week against your target, and this month, with how much of it is billable.' },
      { el: '[data-tour="new-entry"]', title: 'Log time', text: 'Add an entry for the day, or press Enter. Pick the project and task type; the rate is frozen when you save.' },
      { el: '[data-tour="timer"]', title: 'Timers', text: 'Play starts a timer on an entry and Stop finishes it. Only one runs at a time, and T stops it from any page.' },
      { title: 'From a task', text: 'On any task, Log time opens this page with the project already picked and the entry linked to the task.' },
    ],
  },
  {
    id: 'tasks',
    title: 'Tasks',
    match: p => p === '/tasks',
    steps: [
      { el: '[data-tour="group-by"]', title: 'Grouped', text: 'By status, project, or due date. Drag a row onto another group to move it.' },
      { el: '[data-tour="everyone"]', title: 'Yours or everyone', text: 'Off shows what is assigned to you. On shows the whole team.' },
      { el: '[data-tour="row"]', title: 'Change things in place', text: 'Click the dot for status, the faces to assign, the date to set a due date. J and K walk the rows, X selects several, then S or A acts on all of them.' },
      { el: '[data-tour="new-task"]', title: 'New task', text: 'Or press N from anywhere. Open a task to add files, comments, and to share it with a client for review.' },
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    match: p => p === '/billing',
    admin: true,
    steps: [
      { el: '[data-tour="new-batch"]', title: 'Batch first', text: 'Pick a client and a period. Everything unbilled in it is listed; untick what should wait. Creating the batch locks those rows so nobody edits them.' },
      { el: '[data-tour="batches"]', title: 'Then the invoice', text: 'Open a batch and choose Create invoice. Lines can be by task type, by project, or one line for the period, and you can edit them before sending.' },
      { title: 'Sending and getting paid', text: 'Send emails the client a link to view and pay. Record payments on the invoice; overdue reminders go out on their own when turned on in Settings.' },
    ],
  },
]

export function useTour() {
  const route = useRoute()
  const supabase = useSupabaseClient()
  const { profile, can } = useCurrentUser()
  const running = useState<string | null>('tour-running', () => null)

  const seen = computed<Record<string, string>>(() => (profile.value?.tours_seen as Record<string, string> | null) ?? {})
  const forPage = computed(() => TOURS.filter(t => t.match(route.path) && (!t.admin || can('manage_billing'))))
  const pageTour = computed(() => forPage.value.find(t => t.id !== 'around') ?? null)

  async function mark(id: string, how: 'done' | 'skipped') {
    if (!profile.value) return
    const next = { ...seen.value, [id]: `${how} ${new Date().toISOString()}` }
    profile.value = { ...profile.value, tours_seen: next }
    await supabase.from('profiles').update({ tours_seen: next }).eq('id', profile.value.id)
  }

  function start(id: string) {
    const tour = TOURS.find(t => t.id === id)
    if (!tour || running.value) return
    const steps: DriveStep[] = tour.steps
      .filter(s => !s.el || document.querySelector(s.el))
      .map(s => ({ element: s.el, popover: { title: s.title, description: s.text } }))
    if (!steps.length) return
    running.value = id
    let finished = false
    const drv = driver({
      showProgress: steps.length > 1,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      allowClose: true,
      overlayOpacity: 0.5,
      stagePadding: 6,
      steps,
      // A plain Skip on every step, next to Back and Next.
      onPopoverRender: (popover) => {
        const skip = document.createElement('button')
        skip.textContent = 'Skip tour'
        skip.className = 'driver-popover-skip-btn'
        skip.addEventListener('click', () => drv.destroy())
        popover.footerButtons.prepend(skip)
      },
      onNextClick: (_el, _step, { state }) => {
        if (state.activeIndex === steps.length - 1) { finished = true; drv.destroy() }
        else drv.moveNext()
      },
      onDestroyed: () => {
        running.value = null
        mark(id, finished ? 'done' : 'skipped')
      },
    })
    drv.drive()
  }

  // First visit: the general tour, then the page's own the next time.
  function maybeStart() {
    if (!profile.value || running.value) return
    const next = forPage.value.find(t => !seen.value[t.id])
    if (next) setTimeout(() => start(next.id), 600)
  }

  return { tours: TOURS, pageTour, start, maybeStart, running }
}
