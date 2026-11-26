// 26 Nov (her phone: the tab bar vanished on the AI Assistant, whose message box takes focus by itself): the page is
// marked data-keyboard only while the on-screen keyboard is really open, i.e. on a phone a text box has focus AND the
// visible height has shrunk by more than a quarter. index.css then hides the bottom tab bar, so it doesn't ride up on
// the keyboard; focus alone (keyboard closed) keeps the tab bar.
// The full height is remembered per screen width: the keyboard never changes the width, turning the phone does.
const TYPING = 'textarea, input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="button"], [type="submit"]), [contenteditable="true"]'

export function startKeyboardWatch() {
  if (typeof window === 'undefined' || !window.visualViewport) return
  const phone = matchMedia('(max-width: 639px)')
  const tallest = {}                                   // screen width -> tallest height seen at that width
  const check = () => {
    const w = window.innerWidth
    tallest[w] = Math.max(tallest[w] || 0, window.innerHeight, window.visualViewport.height)
    const typing = document.activeElement?.matches?.(TYPING)
    const open = phone.matches && typing && window.visualViewport.height < tallest[w] * 0.75
    document.documentElement.toggleAttribute('data-keyboard', Boolean(open))
  }
  check()
  window.visualViewport.addEventListener('resize', check)
  window.addEventListener('resize', check)
  document.addEventListener('focusin', check)
  document.addEventListener('focusout', () => setTimeout(check, 50))
}
