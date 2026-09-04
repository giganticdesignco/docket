// The fun. Party mode (a rainbow line and a slowly turning logo, for
// the session), the About box behind seven clicks on the logo, and a
// few words the search box answers to. Nothing here is documented
// beyond a wink in the guide.
export function useEasterEggs() {
  const party = useState('egg-party', () => false)
  const aboutOpen = useState('egg-about', () => false)
  const toast = useToast()

  function toggleParty() {
    party.value = !party.value
    if (party.value) confetti()
    toast.add({ title: party.value ? 'Cheat code accepted' : 'Party over', description: party.value ? 'Party mode is on for this session.' : 'Back to work.', color: party.value ? 'primary' : 'neutral', duration: 3000 })
  }
  function flipCoin() {
    const heads = Math.random() < 0.5
    toast.add({ title: heads ? 'Heads' : 'Tails', description: 'The coin has spoken.', icon: 'i-lucide-coins', duration: 4000 })
  }
  function rollD20() {
    const n = 1 + Math.floor(Math.random() * 20)
    toast.add({ title: `You rolled ${n}`, description: n === 20 ? 'Natural twenty. Bill the client double.' : n === 1 ? 'Critical fail. Maybe tomorrow.' : 'A perfectly normal number.', icon: 'i-lucide-dices', duration: 4000 })
  }
  function xyzzy() {
    toast.add({ title: 'Nothing happens', description: 'You are in a maze of twisty little tasks, all alike.', duration: 4000 })
  }
  return { party, aboutOpen, toggleParty, flipCoin, rollD20, xyzzy }
}
