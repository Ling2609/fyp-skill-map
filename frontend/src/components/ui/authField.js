// The field look shared by every control on the entry screens. Border colour is
// passed in, never layered over a base, so a state can't lose a fight.
export const AUTH_FIELD =
  'w-full h-12 rounded-[11px] border-[1.5px] bg-white px-3.5 text-body text-ink placeholder:text-[#8a8aa0] ' +
  'transition-[border-color,box-shadow,background] duration-150 hover:border-field ' +
  'focus:outline-none focus:border-accent focus:bg-white focus:ring-[4px] focus:ring-accent/15 ' +
  'disabled:bg-well disabled:text-muted'

// 20 Nov (her review): a field's state colour stays while you type (it used to turn blue on focus)
export const AUTH_TONE = { idle: 'border-line-strong', ok: 'border-have focus:border-have focus:ring-have/20', bad: 'border-missing focus:border-missing focus:ring-missing/20' }
