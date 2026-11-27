import { Store, uid } from './store.js';
import * as D from './dates.js';

const store = new Store(window.THUIS_CONFIG || {});
const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');

// ---------- Hulpjes ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const device = {
  get me() { return localStorage.getItem('thuis.me') || ''; },
  set me(v) { localStorage.setItem('thuis.me', v); },
  get wall() { return localStorage.getItem('thuis.wall') === '1'; },
  set wall(v) { localStorage.setItem('thuis.wall', v ? '1' : '0'); },
  get history() { try { return JSON.parse(localStorage.getItem('thuis.shophistory')) || {}; } catch { return {}; } },
  set history(v) { localStorage.setItem('thuis.shophistory', JSON.stringify(v)); },
};

function settings() {
  const s = store.get('settings')?.data || {};
  return { people: s.people?.length === 2 ? s.people : ['Isabel', 'Ik'] };
}
const people = () => settings().people;
const whoOptions = () => [...people(), 'Samen'];
function whoClass(who) {
  const i = people().indexOf(who);
  return i === 0 ? 'p0' : i === 1 ? 'p1' : who ? 'p2' : '';
}
const whoTag = (who) => (who ? `<span class="tag ${whoClass(who)}">${esc(who)}</span>` : '');

const icons = {
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.5 3 3 5.5-6.5"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  tick: '<svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
};

// ---------- Toast met ongedaan maken ----------

let toastTimer;
function toast(msg, undo) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Ongedaan maken</button>' : ''}`;
  t.className = 'show';
  if (undo) $('button', t).onclick = () => { undo(); t.className = ''; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 4500);
}

// ---------- Bewerk-venster ----------

function sheet({ title, body, onSave, onDelete, saveLabel = 'Bewaar' }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `
    <form method="dialog">
      <header>
        <button type="button" class="link" data-act="cancel">Annuleer</button>
        <h2>${esc(title)}</h2>
        <button type="submit" class="link strong">${esc(saveLabel)}</button>
      </header>
      <div class="fields">${body}</div>
      ${onDelete ? '<button type="button" class="danger" data-act="delete">Verwijder</button>' : ''}
    </form>`;
  document.body.append(dlg);
  const form = $('form', dlg);
  const close = () => { dlg.close(); dlg.remove(); };
  $('[data-act=cancel]', dlg).onclick = close;
  if (onDelete) $('[data-act=delete]', dlg).onclick = () => { onDelete(); close(); };
  form.onsubmit = (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    form.querySelectorAll('input[type=checkbox]').forEach((c) => { values[c.name] = c.checked; });
    if (onSave(values, form) !== false) close();
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.showModal();
  const first = form.querySelector('.fields input, .fields select');
  if (first && !('ontouchstart' in window)) first.focus();
  return dlg;
}

const select = (name, options, value) => `<select name="${name}">${options
  .map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`)
  .join('')}</select>`;
const whoSelect = (value, allowNone = true) => select('who',
  [...(allowNone ? [['', 'Niemand in het bijzonder']] : []), ...whoOptions().map((p) => [p, p])], value);

// =====================================================================
// Boodschappen
// =====================================================================

function shopItems() {
  const items = store.all('shop');
  const todo = items.filter((i) => !i.data.done).sort((a, b) => (b.data.created || '').localeCompare(a.data.created || ''));
  const done = items.filter((i) => i.data.done).sort((a, b) => (b.data.doneAt || '').localeCompare(a.data.doneAt || ''));
  return { todo, done };
}

function addShop(name) {
  name = name.trim();
  if (!name) return;
  const exists = store.all('shop').find((i) => !i.data.done && i.data.name.toLowerCase() === name.toLowerCase());
  if (exists) { toast(`${name} staat al op de lijst`); return; }
  store.put('shop', { name, done: false, created: new Date().toISOString(), by: device.me || '' });
  const h = device.history;
  const key = name.toLowerCase();
  h[key] = { name, n: (h[key]?.n || 0) + 1 };
  device.history = h;
}

function toggleShop(id) {
  const it = store.get(id);
  if (!it) return;
  store.update(id, { done: !it.data.done, doneAt: new Date().toISOString() });
}

function editShop(id) {
  const it = store.get(id);
  sheet({
    title: 'Boodschap',
    body: `<label>Wat<input name="name" value="${esc(it.data.name)}" required></label>
           <label>Notitie<input name="note" value="${esc(it.data.note)}" placeholder="bijv. 2 pakken, merk, …"></label>`,
    onSave: (v) => store.update(id, { name: v.name.trim() || it.data.name, note: v.note.trim() }),
    onDelete: () => store.remove(id),
  });
}

function shopRow(it) {
  return `<li class="row ${it.data.done ? 'done' : ''}">
    <button class="tickbox" data-toggle="${it.id}" aria-label="Afvinken">${icons.tick}</button>
    <button class="row-main" data-edit="${it.id}">
      <span class="title">${esc(it.data.name)}</span>
      ${it.data.note ? `<span class="sub">${esc(it.data.note)}</span>` : ''}
    </button>
  </li>`;
}

function suggestions() {
  const open = new Set(store.all('shop').filter((i) => !i.data.done).map((i) => i.data.name.toLowerCase()));
  return Object.values(device.history)
    .filter((h) => !open.has(h.name.toLowerCase()))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
}

function shopForm() {
  return `<form class="addbar" data-shopform>
    <input name="name" placeholder="Wat moet er gehaald worden?" autocomplete="off" list="shop-history" enterkeyhint="done">
    <button type="submit" class="round" aria-label="Toevoegen">${icons.plus}</button>
    <datalist id="shop-history"></datalist>
  </form>`;
}

function bindShop(el) {
  el.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-shopform]');
    if (!f) return;
    e.preventDefault();
    addShop(f.name.value);
    f.name.value = '';
  });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) return toggleShop(t.dataset.toggle);
    const ed = e.target.closest('[data-edit]');
    if (ed) return editShop(ed.dataset.edit);
    const s = e.target.closest('[data-suggest]');
    if (s) return addShop(s.dataset.suggest);
    if (e.target.closest('[data-clear]')) {
      const done = shopItems().done;
      done.forEach((i) => store.remove(i.id));
      toast(`${done.length} weggehaald`, () => done.forEach((i) => store.put(i.kind, i.data, i.id)));
    }
  });
}

const ShopView = {
  title: 'Boodschappen', icon: icons.cart,
  mount(el) {
    el.innerHTML = `${shopForm()}<div data-region></div>`;
    bindShop(el);
  },
  update(el) {
    const { todo, done } = shopItems();
    const sug = suggestions();
    $('#shop-history', el).innerHTML = sug.map((s) => `<option value="${esc(s.name)}">`).join('');
    $('[data-region]', el).innerHTML = `
      ${todo.length ? `<ul class="list">${todo.map(shopRow).join('')}</ul>`
        : '<p class="empty">De lijst is leeg. 🎉</p>'}
      ${sug.length ? `<div class="chips"><span class="chips-label">Vaak gehaald</span>${sug.slice(0, 8)
        .map((s) => `<button class="chip" data-suggest="${esc(s.name)}">+ ${esc(s.name)}</button>`).join('')}</div>` : ''}
      ${done.length ? `<div class="section-head"><h3>In het mandje · ${done.length}</h3>
        <button class="link" data-clear>Wis</button></div>
        <ul class="list">${done.map(shopRow).join('')}</ul>` : ''}`;
  },
};

// =====================================================================
// Agenda
// =====================================================================

const repeatLabels = { none: 'Niet herhalen', weekly: 'Elke week', monthly: 'Elke maand', yearly: 'Elk jaar' };

function agendaDays(from, to) {
  const map = new Map();
  for (const ev of store.all('event')) {
    for (const d of D.occurrences(ev.data, from, to)) {
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(ev);
    }
  }
  for (const list of map.values()) list.sort((a, b) => (a.data.time || '').localeCompare(b.data.time || ''));
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function editEvent(id, presetDate) {
  const ev = id ? store.get(id) : null;
  const d = ev?.data || { date: presetDate || D.today(), repeat: 'none', who: '' };
  sheet({
    title: ev ? 'Afspraak' : 'Nieuwe afspraak',
    body: `<label>Wat<input name="title" value="${esc(d.title)}" required placeholder="bijv. Etentje bij oma"></label>
      <label>Datum<input type="date" name="date" value="${esc(d.date)}" required></label>
      <div class="two">
        <label>Begin<input type="time" name="time" value="${esc(d.time)}"></label>
        <label>Eind<input type="time" name="end" value="${esc(d.end)}"></label>
      </div>
      <p class="hint">Laat de tijd leeg voor een hele dag.</p>
      <label>Voor wie${whoSelect(d.who)}</label>
      <label>Herhalen${select('repeat', Object.entries(repeatLabels), d.repeat || 'none')}</label>
      <label>Notitie<textarea name="note" rows="2">${esc(d.note)}</textarea></label>`,
    onSave: (v) => {
      const data = { title: v.title.trim(), date: v.date, time: v.time, end: v.end, who: v.who, repeat: v.repeat, note: v.note.trim() };
      if (ev) store.put('event', data, id); else store.put('event', data);
    },
    onDelete: ev ? () => {
      store.remove(id);
      toast('Afspraak verwijderd', () => store.put('event', ev.data, id));
    } : null,
  });
}

function eventRow(ev) {
  const d = ev.data;
  const time = d.time ? `${d.time}${d.end ? `–${d.end}` : ''}` : 'Hele dag';
  return `<li class="row event ${whoClass(d.who)}">
    <button class="row-main" data-event="${ev.id}">
      <span class="time">${esc(time)}</span>
      <span class="title">${esc(d.title)}${d.repeat && d.repeat !== 'none' ? `<i class="mini">${icons.repeat}</i>` : ''}</span>
      ${d.note ? `<span class="sub">${esc(d.note)}</span>` : ''}
    </button>
    ${whoTag(d.who)}
  </li>`;
}

function agendaHtml(days, { long = true, emptyDays = false, from, to } = {}) {
  if (emptyDays) {
    const map = new Map(days);
    days = [];
    for (let d = from; d <= to; d = D.addDays(d, 1)) days.push([d, map.get(d) || []]);
  }
  if (!days.length) return '<p class="empty">Geen afspraken gepland.</p>';
  return days.map(([date, evs]) => `
    <section class="day ${date === D.today() ? 'is-today' : ''}">
      <h3>${esc(D.dayLabel(date, long))}${D.diffDays(D.today(), date) <= 1 ? ` <small>${esc(D.longDate(date))}</small>` : ''}</h3>
      ${evs.length ? `<ul class="list">${evs.map(eventRow).join('')}</ul>` : '<p class="nothing">—</p>'}
    </section>`).join('');
}

const AgendaView = {
  title: 'Agenda', icon: icons.cal,
  mount(el) {
    el.innerHTML = `<div class="toolbar">
        <button class="pill" data-new-event>${icons.plus} Afspraak</button>
        <label class="switch"><input type="checkbox" data-past> Toon afgelopen 2 weken</label>
      </div><div data-region></div>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-new-event]')) return editEvent(null);
      const r = e.target.closest('[data-event]');
      if (r) editEvent(r.dataset.event);
    });
    $('[data-past]', el).onchange = () => this.update(el);
  },
  update(el) {
    const past = $('[data-past]', el).checked;
    const from = past ? D.addDays(D.today(), -14) : D.today();
    const to = D.addDays(D.today(), 90);
    $('[data-region]', el).innerHTML = agendaHtml(agendaDays(from, to));
  },
};

// =====================================================================
// Taken
// =====================================================================

const everyLabels = { once: 'Eenmalig', day: 'Elke dag', week: 'Elke week', '2weeks': 'Elke 2 weken', month: 'Elke maand' };

function choreGroups() {
  const t = D.today();
  const groups = { late: [], today: [], week: [], later: [] };
  for (const c of store.all('chore')) {
    const n = D.diffDays(t, c.data.due || t);
    if (n < 0) groups.late.push(c);
    else if (n === 0) groups.today.push(c);
    else if (n <= 7) groups.week.push(c);
    else groups.later.push(c);
  }
  for (const g of Object.values(groups)) g.sort((a, b) => (a.data.due || '').localeCompare(b.data.due || '') || a.data.title.localeCompare(b.data.title));
  return groups;
}

function completeChore(id) {
  const c = store.get(id);
  if (!c) return;
  const prev = { ...c.data };
  if (!c.data.every || c.data.every === 'once') {
    store.remove(id);
    toast(`✓ ${c.data.title}`, () => store.put('chore', prev, id));
  } else {
    const due = D.nextDue(c.data.every);
    store.update(id, { due, lastDone: D.today(), lastBy: device.me || '' });
    toast(`✓ ${c.data.title} — volgende keer ${D.dayLabel(due).toLowerCase()}`, () => store.put('chore', prev, id));
  }
}

function editChore(id) {
  const c = id ? store.get(id) : null;
  const d = c?.data || { every: 'week', due: D.today(), who: '' };
  sheet({
    title: c ? 'Taak' : 'Nieuwe taak',
    body: `<label>Wat<input name="title" value="${esc(d.title)}" required placeholder="bijv. Badkamer schoonmaken"></label>
      <label>Wie${whoSelect(d.who)}</label>
      <label>Hoe vaak${select('every', Object.entries(everyLabels), d.every || 'once')}</label>
      <label>Eerstvolgende keer<input type="date" name="due" value="${esc(d.due)}" required></label>
      ${d.lastDone ? `<p class="hint">Laatst gedaan: ${esc(D.dayLabel(d.lastDone).toLowerCase())}${d.lastBy ? ` door ${esc(d.lastBy)}` : ''}</p>` : ''}`,
    onSave: (v) => {
      const data = { ...d, title: v.title.trim(), who: v.who, every: v.every, due: v.due };
      if (c) store.put('chore', data, id); else store.put('chore', data);
    },
    onDelete: c ? () => {
      store.remove(id);
      toast('Taak verwijderd', () => store.put('chore', c.data, id));
    } : null,
  });
}

function choreRow(c) {
  const d = c.data;
  const n = D.diffDays(D.today(), d.due || D.today());
  const when = n < 0 ? `${-n} ${-n === 1 ? 'dag' : 'dagen'} te laat` : D.dayLabel(d.due, false);
  return `<li class="row chore ${n < 0 ? 'late' : ''}">
    <button class="tickbox" data-done="${c.id}" aria-label="Gedaan">${icons.tick}</button>
    <button class="row-main" data-chore="${c.id}">
      <span class="title">${esc(d.title)}</span>
      <span class="sub">${esc(when)}${d.every && d.every !== 'once' ? ` · ${esc(everyLabels[d.every].toLowerCase())}` : ''}</span>
    </button>
    ${whoTag(d.who)}
  </li>`;
}

function bindChores(el) {
  el.addEventListener('click', (e) => {
    const done = e.target.closest('[data-done]');
    if (done) {
      done.closest('.row').classList.add('done');
      return setTimeout(() => completeChore(done.dataset.done), 250);
    }
    const r = e.target.closest('[data-chore]');
    if (r) return editChore(r.dataset.chore);
    if (e.target.closest('[data-new-chore]')) editChore(null);
  });
}

const ChoreView = {
  title: 'Taken', icon: icons.check,
  mount(el) {
    el.innerHTML = `<div class="toolbar">
        <button class="pill" data-new-chore>${icons.plus} Taak</button>
        <div class="filter" data-filter></div>
      </div><div data-region></div>`;
    bindChores(el);
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-who]');
      if (f) { this.filter = f.dataset.who; this.update(el); }
    });
  },
  filter: '',
  update(el) {
    const opts = [['', 'Iedereen'], ...whoOptions().map((p) => [p, p])];
    $('[data-filter]', el).innerHTML = opts.map(([v, l]) =>
      `<button class="seg ${this.filter === v ? 'on' : ''}" data-who="${esc(v)}">${esc(l)}</button>`).join('');
    const g = choreGroups();
    const f = (list) => (this.filter ? list.filter((c) => c.data.who === this.filter || (!c.data.who || c.data.who === 'Samen')) : list);
    const block = (title, list, cls = '') => (list.length
      ? `<section class="group ${cls}"><h3>${title} · ${list.length}</h3><ul class="list">${list.map(choreRow).join('')}</ul></section>` : '');
    const html = block('Te laat', f(g.late), 'late') + block('Vandaag', f(g.today)) + block('Komende week', f(g.week)) + block('Later', f(g.later));
    $('[data-region]', el).innerHTML = html || '<p class="empty">Geen taken. Voeg er een toe met “+ Taak”.</p>';
  },
};

// =====================================================================
// Meer / instellingen
// =====================================================================

const MoreView = {
  title: 'Meer', icon: icons.more,
  mount(el) {
    el.innerHTML = '<div data-region></div>';
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'me') device.me = t.value;
      if (t.name === 'wall') device.wall = t.checked;
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const p = [f.p0.value.trim() || 'Isabel', f.p1.value.trim() || 'Ik'];
      const old = people();
      store.put('settings', { ...(store.get('settings')?.data || {}), people: p }, 'settings');
      // Namen in bestaande items meewijzigen.
      for (const r of [...store.all('event'), ...store.all('chore')]) {
        const i = old.indexOf(r.data.who);
        if (i >= 0 && old[i] !== p[i]) store.update(r.id, { who: p[i] });
      }
      if (old.includes(device.me)) device.me = p[old.indexOf(device.me)];
      toast('Namen bewaard');
    });
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-wall]')) go('muur');
      if (e.target.closest('[data-logout]')) { await store.signOut(); boot(); }
    });
  },
  update(el) {
    const p = people();
    const statusText = { lokaal: 'Alleen op dit apparaat (nog niet gekoppeld aan Supabase)', online: 'Gesynchroniseerd', offline: 'Offline — wijzigingen worden later verstuurd', verbinden: 'Verbinden…' }[store.status];
    $('[data-region]', el).innerHTML = `
      <section class="card">
        <h3>Wie wonen hier?</h3>
        <form class="stack">
          <label>Persoon 1<input name="p0" value="${esc(p[0])}"></label>
          <label>Persoon 2<input name="p1" value="${esc(p[1])}"></label>
          <button class="pill" type="submit">Bewaar namen</button>
        </form>
      </section>
      <section class="card">
        <h3>Dit apparaat</h3>
        <label>Wie gebruikt dit apparaat?${select('me', [['', '— (gedeeld apparaat)'], ...p.map((x) => [x, x])], device.me)}</label>
        <label class="switch"><input type="checkbox" name="wall" ${device.wall ? 'checked' : ''}> Altijd openen als muurscherm</label>
        <button class="pill" data-wall>Open muurscherm</button>
      </section>
      <section class="card">
        <h3>Synchronisatie</h3>
        <p><span class="dot ${store.status}"></span> ${esc(statusText)}</p>
        ${store.user ? `<p class="hint">Ingelogd als ${esc(store.user.email)}</p><button class="pill ghost" data-logout>Uitloggen</button>` : ''}
      </section>
      <section class="card">
        <h3>Op je beginscherm zetten</h3>
        <p class="hint">Open deze pagina in Safari, tik op de deelknop <b>⬆︎</b> en kies <b>“Zet op beginscherm”</b>.
        Op de iPad aan de muur: zet “Altijd openen als muurscherm” aan, en zet bij Instellingen → Beeldscherm en helderheid
        → Automatisch vergrendelen op “Nooit”.</p>
      </section>`;
  },
};

// =====================================================================
// Muurscherm (iPad)
// =====================================================================

let wakeLock;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* niet ondersteund */ }
}

const WallView = {
  mount(el) {
    el.innerHTML = `
      <header class="wall-head">
        <div><div class="clock" data-clock></div><div class="date" data-date></div></div>
        <div class="wall-actions"><span class="dot" data-status></span><button class="link" data-exit>${icons.exit} App</button></div>
      </header>
      <div class="wall-grid">
        <section class="panel"><div class="panel-head"><h2>${icons.cal} Agenda</h2><button class="round small" data-new-event>${icons.plus}</button></div><div data-agenda></div></section>
        <section class="panel"><div class="panel-head"><h2>${icons.check} Taken</h2><button class="round small" data-new-chore>${icons.plus}</button></div><div data-chores></div></section>
        <section class="panel"><div class="panel-head"><h2>${icons.cart} Boodschappen</h2></div>${shopForm()}<div data-shop></div></section>
      </div>`;
    bindShop(el);
    bindChores(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-exit]')) { device.wall = false; go('boodschappen'); }
      if (e.target.closest('[data-new-event]')) editEvent(null);
      const r = e.target.closest('[data-event]');
      if (r) editEvent(r.dataset.event);
    });
    keepAwake();
  },
  update(el) {
    const now = new Date();
    $('[data-clock]', el).textContent = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    $('[data-date]', el).textContent = D.longDate(D.today());
    $('[data-status]', el).className = `dot ${store.status}`;
    const from = D.today(); const to = D.addDays(from, 6);
    $('[data-agenda]', el).innerHTML = agendaHtml(agendaDays(from, to), { long: false, emptyDays: true, from, to });
    const g = choreGroups();
    const tomorrow = g.week.filter((c) => c.data.due === D.addDays(D.today(), 1));
    const sect = (t, l, cls = '') => (l.length ? `<section class="group ${cls}"><h3>${t}</h3><ul class="list">${l.map(choreRow).join('')}</ul></section>` : '');
    $('[data-chores]', el).innerHTML = (sect('Te laat', g.late, 'late') + sect('Vandaag', g.today) + sect('Morgen', tomorrow))
      || '<p class="empty">Niets te doen vandaag. ✨</p>';
    const { todo, done } = shopItems();
    $('#shop-history', el).innerHTML = suggestions().map((s) => `<option value="${esc(s.name)}">`).join('');
    $('[data-shop]', el).innerHTML = (todo.length ? `<ul class="list">${todo.map(shopRow).join('')}</ul>` : '<p class="empty">Niets nodig.</p>')
      + (done.length ? `<div class="section-head"><h3>In het mandje · ${done.length}</h3><button class="link" data-clear>Wis</button></div>` : '');
  },
};

// =====================================================================
// Navigatie
// =====================================================================

const views = { boodschappen: ShopView, agenda: AgendaView, taken: ChoreView, meer: MoreView, muur: WallView };
let current;
let viewEl;

function go(name) {
  if (!views[name]) name = 'boodschappen';
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  current = name;
  const wall = name === 'muur';
  document.body.classList.toggle('wall', wall);
  if (wall && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  app.innerHTML = wall ? '<main class="view wallview"></main>' : `
    <header class="top"><h1>${esc(views[name].title)}</h1><span class="dot" data-status title="Synchronisatie"></span></header>
    <main class="view"></main>
    <nav class="tabs">${['boodschappen', 'agenda', 'taken', 'meer'].map((k) => `
      <button class="${k === name ? 'on' : ''}" data-go="${k}">${views[k].icon}<span>${esc(views[k].title)}</span>${k === 'boodschappen' || k === 'taken' ? `<b class="badge" data-badge="${k}"></b>` : ''}</button>`).join('')}
    </nav>`;
  viewEl = $('.view', app);
  views[name].mount(viewEl);
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (!current || !viewEl) return;
  views[current].update(viewEl);
  const st = $('.top [data-status]', app);
  if (st) st.className = `dot ${store.status}`;
  const shopN = shopItems().todo.length;
  const g = choreGroups();
  const choreN = g.late.length + g.today.length;
  const set = (k, n) => { const b = $(`[data-badge=${k}]`, app); if (b) { b.textContent = n || ''; b.hidden = !n; } };
  set('boodschappen', shopN);
  set('taken', choreN);
}

app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) go(b.dataset.go);
});
window.addEventListener('hashchange', () => { const n = location.hash.slice(1); if (n !== current) go(n); });

// Klok en dagwissel
setInterval(() => { if (!$('dialog[open]')) render(); }, 30 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { render(); if (current === 'muur') keepAwake(); }
});

let pending;
store.onChange(() => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(render);
});
document.addEventListener('close', () => render(), true);

// =====================================================================
// Inloggen en opstarten
// =====================================================================

function loginScreen() {
  document.body.classList.remove('wall');
  current = null;
  app.innerHTML = `<div class="login">
    <div class="logo">${icons.check}</div>
    <h1>Thuis</h1>
    <p>Log in om de lijstjes te delen.</p>
    <form class="stack">
      <input type="email" name="email" placeholder="E-mailadres" autocomplete="username" required>
      <input type="password" name="password" placeholder="Wachtwoord" autocomplete="current-password" required>
      <button class="pill big" type="submit">Inloggen</button>
      <p class="error" hidden></p>
    </form>
  </div>`;
  $('form', app).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = $('.error', f);
    err.hidden = true;
    f.querySelector('button').disabled = true;
    try {
      await store.signIn(f.email.value.trim(), f.password.value);
      boot();
    } catch (ex) {
      err.textContent = /invalid/i.test(ex.message) ? 'E-mailadres of wachtwoord klopt niet.' : `Inloggen mislukt: ${ex.message}`;
      err.hidden = false;
      f.querySelector('button').disabled = false;
    }
  };
}

async function boot() {
  if (store.cloud) {
    const user = await store.session();
    if (!user) return loginScreen();
    store.start();
  }
  const fromHash = location.hash.slice(1);
  go(views[fromHash] ? fromHash : device.wall ? 'muur' : 'boodschappen');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();

export { uid };
