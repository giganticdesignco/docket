// The fun. Each egg does its own thing, in keeping with what it is:
// the arcade cheat code turns the screen into an arcade cabinet, the
// credits roll like film credits, the coin flips, the die tumbles,
// and xyzzy opens a text adventure. Nothing here is documented beyond
// a wink in the guide.
export type Effect = 'coin' | 'd20' | 'adventure' | 'credits' | null
export function useEasterEggs() {
  const party = useState('egg-party', () => false)
  const arcade = useState('egg-arcade', () => false)
  const effect = useState<Effect>('egg-effect', () => null)

  const toggleParty = () => { party.value = !party.value; if (party.value) confetti() }
  const toggleArcade = () => { arcade.value = !arcade.value }
  const flipCoin = () => { effect.value = 'coin' }
  const rollD20 = () => { effect.value = 'd20' }
  const adventure = () => { effect.value = 'adventure' }
  const credits = () => { effect.value = 'credits' }
  return { party, arcade, effect, toggleParty, toggleArcade, flipCoin, rollD20, adventure, credits }
}
