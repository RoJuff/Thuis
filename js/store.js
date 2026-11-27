// Gegevensopslag: lokaal (localStorage) of gedeeld via Supabase, met offline wachtrij.

const CACHE_KEY = 'thuis.cache.v1';
const QUEUE_KEY = 'thuis.queue.v1';

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* vol of privé-modus */ }
}

export class Store {
  constructor(config) {
    this.records = new Map(load(CACHE_KEY, []).map((r) => [r.id, r]));
    this.queue = load(QUEUE_KEY, []);
    this.listeners = new Set();
    this.cloud = !!(config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase);
    this.status = this.cloud ? 'verbinden' : 'lokaal';
    this.user = null;
    if (this.cloud) {
      this.sb = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'thuis.auth' },
      });
    }
  }

  onChange(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  emit() {
    save(CACHE_KEY, [...this.records.values()]);
    for (const cb of this.listeners) cb();
  }

  all(kind) {
    return [...this.records.values()].filter((r) => r.kind === kind);
  }
  get(id) { return this.records.get(id); }

  put(kind, data, id = uid()) {
    const rec = { id, kind, data, updated_at: new Date().toISOString() };
    this.records.set(id, rec);
    this.emit();
    if (this.cloud) this.enqueue({ op: 'upsert', rec });
    return rec;
  }

  update(id, patch) {
    const cur = this.records.get(id);
    if (!cur) return;
    return this.put(cur.kind, { ...cur.data, ...patch }, id);
  }

  remove(id) {
    if (!this.records.has(id)) return;
    this.records.delete(id);
    this.emit();
    if (this.cloud) this.enqueue({ op: 'delete', id });
  }

  // ---------- Cloud ----------

  async session() {
    if (!this.cloud) return null;
    const { data } = await this.sb.auth.getSession();
    this.user = data.session?.user ?? null;
    return this.user;
  }

  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    return data.user;
  }

  async signOut() {
    if (this.cloud) await this.sb.auth.signOut();
    this.user = null;
    this.records.clear();
    this.queue = [];
    save(QUEUE_KEY, this.queue);
    this.emit();
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    for (const cb of this.listeners) cb();
  }

  async start() {
    if (!this.cloud) return;
    await this.flush();
    await this.refresh();
    this.subscribe();
    window.addEventListener('online', () => this.resync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.resync();
    });
    // Vangnet voor het muurscherm: elke 5 minuten alles opnieuw ophalen.
    setInterval(() => this.resync(), 5 * 60 * 1000);
  }

  async resync() {
    await this.flush();
    await this.refresh();
    if (!this.channel || this.channel.state !== 'joined') this.subscribe();
  }

  async refresh() {
    const { data, error } = await this.sb.from('records').select('*');
    if (error) { this.setStatus('offline'); return; }
    const pendingIds = new Set(this.queue.map((q) => q.rec?.id ?? q.id));
    const next = new Map();
    for (const r of data) next.set(r.id, r);
    // Lokale wijzigingen die nog niet verstuurd zijn, gaan voor.
    for (const id of pendingIds) {
      const local = this.records.get(id);
      if (local) next.set(id, local); else next.delete(id);
    }
    this.records = next;
    this.setStatus(this.queue.length ? 'offline' : 'online');
    this.emit();
  }

  subscribe() {
    if (this.channel) this.sb.removeChannel(this.channel);
    this.channel = this.sb
      .channel('records-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (p) => {
        if (p.eventType === 'DELETE') {
          this.records.delete(p.old.id);
        } else {
          const cur = this.records.get(p.new.id);
          if (cur && cur.updated_at > p.new.updated_at) return;
          this.records.set(p.new.id, p.new);
        }
        this.emit();
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') this.setStatus(this.queue.length ? 'offline' : 'online');
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') this.setStatus('offline');
      });
  }

  enqueue(item) {
    this.queue.push(item);
    save(QUEUE_KEY, this.queue);
    this.flush();
  }

  async flush() {
    if (!this.cloud || this.flushing || !this.user) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const item = this.queue[0];
        const res = item.op === 'upsert'
          ? await this.sb.from('records').upsert(item.rec)
          : await this.sb.from('records').delete().eq('id', item.id);
        if (res.error) {
          // Netwerkfout: later opnieuw. Andere fout (bijv. rechten): overslaan.
          if (!navigator.onLine || /fetch|network|load failed/i.test(res.error.message)) {
            this.setStatus('offline');
            break;
          }
          console.warn('Synchronisatie mislukt', res.error);
        }
        this.queue.shift();
        save(QUEUE_KEY, this.queue);
      }
      if (!this.queue.length) this.setStatus('online');
    } catch {
      this.setStatus('offline');
    } finally {
      this.flushing = false;
    }
  }
}
