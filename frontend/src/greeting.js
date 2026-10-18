// The dashboard greeting (19 Oct, her pick 8: "show different greetings, don't just fix one"). It still follows the
// time of day, but the wording changes from day to day. It stays the same all day part long, so it never changes
// while the page is open or on the next visit that morning.
const GREETINGS = {
  morning: ['Good morning, {n}', 'Morning, {n}', 'Welcome back, {n}', 'Hi {n}, good to see you'],
  afternoon: ['Good afternoon, {n}', 'Hello, {n}', 'Welcome back, {n}', 'Hi {n}, good to see you'],
  evening: ['Good evening, {n}', 'Evening, {n}', 'Welcome back, {n}', 'Hi {n}, good to see you'],
  night: ['Working late, {n}?', 'Hi {n}', 'Welcome back, {n}', 'Still up, {n}?'],
}

export function greeting(name, now = new Date()) {
  const h = now.getHours()
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 23 ? 'evening' : 'night'   // past midnight isn't "morning"
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)   // day of the year
  const options = GREETINGS[part]
  return options[day % options.length].replace('{n}', name || 'there')
}
