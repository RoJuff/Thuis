// Datumhulpjes. Datums worden opgeslagen als 'YYYY-MM-DD' in lokale tijd.

const pad = (n) => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function today() { return iso(new Date()); }

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function addMonths(s, n) {
  const d = parse(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return iso(d);
}
export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}

const fmtLong = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

export function dayLabel(s, long = true) {
  const n = diffDays(today(), s);
  if (n === 0) return 'Vandaag';
  if (n === 1) return 'Morgen';
  if (n === -1) return 'Gisteren';
  return (long ? fmtLong : fmtShort).format(parse(s));
}
export function longDate(s) { return fmtLong.format(parse(s)); }

// Alle datums waarop een (eventueel herhalende) afspraak valt binnen [from, to].
export function occurrences(ev, from, to) {
  const out = [];
  const start = ev.date;
  if (!start) return out;
  const repeat = ev.repeat || 'none';
  if (repeat === 'none') {
    if (start >= from && start <= to) out.push(start);
    return out;
  }
  let cur = start;
  let i = 0;
  // Spring dichter bij 'from' voor wekelijkse herhaling.
  if (repeat === 'weekly' && cur < from) {
    const weeks = Math.floor(diffDays(cur, from) / 7);
    cur = addDays(cur, weeks * 7);
  }
  while (cur <= to && i < 1000) {
    if (cur >= from && (!ev.until || cur <= ev.until)) out.push(cur);
    i++;
    if (repeat === 'weekly') cur = addDays(cur, 7);
    else if (repeat === 'monthly') cur = addMonths(start, i);
    else if (repeat === 'yearly') cur = addMonths(start, 12 * i);
    else break;
  }
  return out;
}

export function nextDue(every, from = today()) {
  switch (every) {
    case 'day': return addDays(from, 1);
    case 'week': return addDays(from, 7);
    case '2weeks': return addDays(from, 14);
    case 'month': return addMonths(from, 1);
    default: return null;
  }
}
