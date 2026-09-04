// What the rails share: the Assistant and shortcut sheet switches, the
// feedback picker, the Help menu, and the light or dark choice. The
// right rail draws them on desktop; the left rail's phone menu too.
export function useRailTools() {
  const assistantOpen = useState('assistant-open', () => false)
  const sheetOpen = useState('shortcut-sheet-open', () => false)
  const feedbackPick = useState('feedback-pick', () => false)
  const tour = useTour()
  const helpItems = computed(() => [[
    ...(tour.pageTour.value ? [{ label: `Tour: ${tour.pageTour.value.title}`, icon: 'i-lucide-route', onSelect: () => tour.start(tour.pageTour.value!.id) }] : []),
    { label: 'User guide', icon: 'i-lucide-book-open', to: '/help' },
    { label: 'Tour: Getting around', icon: 'i-lucide-compass', onSelect: () => tour.start('around') },
    { label: 'Keyboard shortcuts', icon: 'i-lucide-keyboard', kbds: ['?'], onSelect: () => { sheetOpen.value = true } },
    { label: 'Send feedback', icon: 'i-lucide-message-square-warning', kbds: ['meta', 'shift', 'f'], onSelect: () => { feedbackPick.value = true } },
  ]])
  // Light or dark, remembered per browser. Client-only where it is drawn,
  // so the server never hydrates the wrong icon.
  const colorMode = useColorMode()
  const isDark = computed({
    get: () => colorMode.value === 'dark',
    set: (v: boolean) => { colorMode.preference = v ? 'dark' : 'light' },
  })
  return { assistantOpen, sheetOpen, feedbackPick, helpItems, isDark }
}
