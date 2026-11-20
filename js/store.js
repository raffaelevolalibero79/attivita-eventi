// store.js — archivio dei dati. Due modalità con la stessa interfaccia:
//  • "local": tutto sul telefono (IndexedDB)
//  • "cloud": Firebase (accesso Google + Firestore) con copia offline sul telefono
import { sanitizeDoc } from './util.js';
import { FIREBASE_CONFIG, FIREBASE_VERSION } from './config.js';

export const COLLS = ['events', 'places', 'trips'];
export const cloudConfigured = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
const LOCAL_ONLY_KEY = 'ae.localOnly';
export const isLocalOnlyChosen = () => { try { return localStorage.getItem(LOCAL_ONLY_KEY) === '1'; } catch { return false; } };
export const setLocalOnly = (on) => { try { on ? localStorage.setItem(LOCAL_ONLY_KEY, '1') : localStorage.removeItem(LOCAL_ONLY_KEY); } catch { /* ignora */ } };

const MAX_THUMB = 500000;
const isThumb = (s) => typeof s === 'string' && s.startsWith('data:image/') && s.length < MAX_THUMB;

class Base {
  constructor() {
    this.state = { events: [], places: [], trips: [] };
    this.listeners = new Set();
    this.statusFns = new Set();
    this.status = 'local';
  }
  onChange(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }
  onStatus(fn) { this.statusFns.add(fn); fn(this.status); return () => this.statusFns.delete(fn); }
  _notify() { for (const fn of this.listeners) { try { fn(this.state); } catch (e) { console.error(e); } } }
  _setStatus(s) { if (s !== this.status) { this.status = s; for (const fn of this.statusFns) fn(s); } }
  _pack(thumbs) {
    return { app: 'attivita-eventi', version: 1, exportedAt: new Date().toISOString(), events: this.state.events, places: this.state.places, trips: this.state.trips, thumbs: thumbs || {} };
  }
  // Controlla e pulisce un file di backup. Ritorna {docs:{coll:[...]}, thumbs:{id:img}}
  _parseImport(json) {
    if (!json || typeof json !== 'object' || json.app !== 'attivita-eventi') throw new Error('Questo non sembra un backup di "Attività ed eventi".');
    const docs = {};
    for (const c of COLLS) docs[c] = (Array.isArray(json[c]) ? json[c] : []).slice(0, 5000).map((d) => sanitizeDoc(c, d));
    const thumbs = {};
    if (json.thumbs && typeof json.thumbs === 'object') {
      for (const [id, img] of Object.entries(json.thumbs).slice(0, 5000)) if (isThumb(img) && /^[A-Za-z0-9_-]{1,40}$/.test(id)) thumbs[id] = img;
    }
    return { docs, thumbs };
  }
}

// ---------------- IndexedDB ----------------
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('attivita-eventi', 1);
    r.onupgradeneeded = () => { for (const n of [...COLLS, 'thumbs']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const idbReq = (db, store, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(store, mode);
  const req = fn(t.objectStore(store));
  t.oncomplete = () => res(req ? req.result : undefined);
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error);
});

class LocalStore extends Base {
  constructor() { super(); this.mode = 'local'; this.status = 'local'; this.user = null; }
  async init() {
    this.db = await openDb();
    for (const c of COLLS) this.state[c] = await idbReq(this.db, c, 'readonly', (s) => s.getAll());
    this._notify();
    return { needsLogin: false };
  }
  put(coll, doc) {
    const d = sanitizeDoc(coll, doc);
    d.updatedAt = Date.now();
    const list = this.state[coll].filter((x) => x.id !== d.id);
    list.push(d);
    this.state[coll] = list;
    idbReq(this.db, coll, 'readwrite', (s) => s.put(d)).catch(console.error);
    this._notify();
    return d;
  }
  remove(coll, id) {
    this.state[coll] = this.state[coll].filter((x) => x.id !== id);
    idbReq(this.db, coll, 'readwrite', (s) => s.delete(id)).catch(console.error);
    idbReq(this.db, 'thumbs', 'readwrite', (s) => s.delete(id)).catch(() => {});
    this._notify();
  }
  async getThumb(id) { const r = await idbReq(this.db, 'thumbs', 'readonly', (s) => s.get(id)); return r ? r.img : null; }
  async putThumb(id, img) { if (isThumb(img)) await idbReq(this.db, 'thumbs', 'readwrite', (s) => s.put({ id, img })); }
  async removeThumb(id) { await idbReq(this.db, 'thumbs', 'readwrite', (s) => s.delete(id)); }
  async exportAll({ thumbs } = {}) {
    const t = {};
    if (thumbs) for (const r of await idbReq(this.db, 'thumbs', 'readonly', (s) => s.getAll())) t[r.id] = r.img;
    return this._pack(t);
  }
  async importAll(json) {
    const { docs, thumbs } = this._parseImport(json);
    for (const c of COLLS) for (const d of docs[c]) this.put(c, d);
    for (const [id, img] of Object.entries(thumbs)) await this.putThumb(id, img);
    return COLLS.reduce((n, c) => n + docs[c].length, 0);
  }
}

// ---------------- Firebase ----------------
class CloudStore extends Base {
  constructor() {
    super();
    this.mode = 'cloud';
    this.status = 'connecting';
    this.user = null;
    this.authFns = new Set();
    this.unsubs = [];
    this.pending = {};
    this.denied = false;
    this.lastError = null;
  }
  onAuth(fn) { this.authFns.add(fn); fn(this.user); return () => this.authFns.delete(fn); }

  async init() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appM, authM, fsM] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`),
    ]);
    this.m = { ...authM, ...fsM };
    this.app = appM.initializeApp(FIREBASE_CONFIG);
    this.auth = authM.getAuth(this.app);
    try {
      this.db = fsM.initializeFirestore(this.app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
    } catch (e) {
      console.warn('Cache offline non disponibile, uso la modalità normale', e);
      this.db = fsM.getFirestore(this.app);
    }
    try { await authM.getRedirectResult(this.auth); } catch (e) { this.lastError = e; }
    await new Promise((res) => {
      let first = true;
      authM.onAuthStateChanged(this.auth, (user) => {
        this.user = user;
        if (user) this._listen(); else this._unlisten();
        for (const fn of this.authFns) fn(user);
        if (first) { first = false; res(); }
      });
    });
    addEventListener('online', () => this._computeStatus());
    addEventListener('offline', () => this._computeStatus());
    return { needsLogin: !this.user };
  }

  _listen() {
    this._unlisten();
    this.denied = false;
    for (const c of COLLS) {
      const un = this.m.onSnapshot(
        this.m.collection(this.db, c),
        { includeMetadataChanges: true },
        (snap) => {
          // Ogni documento letto dal database viene ripulito: qualunque dato anomalo viene scartato.
          this.state[c] = snap.docs.map((d) => sanitizeDoc(c, { ...d.data(), id: d.id }));
          this.pending[c] = snap.metadata.hasPendingWrites;
          this._notify();
          this._computeStatus();
        },
        (err) => this._onError(err),
      );
      this.unsubs.push(un);
    }
  }
  _unlisten() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.state = { events: [], places: [], trips: [] };
    this._notify();
  }
  _onError(err) {
    this.lastError = err;
    console.error(err);
    if (err && err.code === 'permission-denied') { this.denied = true; this._setStatus('denied'); } else this._setStatus('error');
  }
  _computeStatus() {
    if (this.denied) return this._setStatus('denied');
    if (!navigator.onLine) return this._setStatus('offline');
    if (Object.values(this.pending).some(Boolean)) return this._setStatus('syncing');
    this._setStatus('ok');
  }

  async signIn() {
    const provider = new this.m.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await this.m.signInWithPopup(this.auth, provider);
    } catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) {
        await this.m.signInWithRedirect(this.auth, provider);
      } else throw e;
    }
  }
  signOut() { return this.m.signOut(this.auth); }

  put(coll, doc) {
    const d = sanitizeDoc(coll, doc);
    d.updatedAt = Date.now();
    this.m.setDoc(this.m.doc(this.db, coll, d.id), d).catch((e) => this._onError(e));
    return d;
  }
  remove(coll, id) {
    this.m.deleteDoc(this.m.doc(this.db, coll, id)).catch((e) => this._onError(e));
    this.m.deleteDoc(this.m.doc(this.db, 'thumbs', id)).catch(() => {});
  }
  async getThumb(id) {
    try { const s = await this.m.getDoc(this.m.doc(this.db, 'thumbs', id)); return s.exists() && isThumb(s.data().img) ? s.data().img : null; } catch { return null; }
  }
  async putThumb(id, img) {
    if (!isThumb(img)) return;
    await this.m.setDoc(this.m.doc(this.db, 'thumbs', id), { img, ts: Date.now() });
  }
  async removeThumb(id) { await this.m.deleteDoc(this.m.doc(this.db, 'thumbs', id)); }

  async exportAll({ thumbs } = {}) {
    const t = {};
    if (thumbs) {
      const snap = await this.m.getDocs(this.m.collection(this.db, 'thumbs'));
      snap.forEach((d) => { if (isThumb(d.data().img)) t[d.id] = d.data().img; });
    }
    return this._pack(t);
  }
  async importAll(json) {
    const { docs, thumbs } = this._parseImport(json);
    const ops = [];
    for (const c of COLLS) for (const d of docs[c]) ops.push([this.m.doc(this.db, c, d.id), d]);
    for (const [id, img] of Object.entries(thumbs)) ops.push([this.m.doc(this.db, 'thumbs', id), { img, ts: Date.now() }]);
    for (let i = 0; i < ops.length; i += 400) {
      const batch = this.m.writeBatch(this.db);
      for (const [ref, data] of ops.slice(i, i + 400)) batch.set(ref, data);
      await batch.commit();
    }
    return COLLS.reduce((n, c) => n + docs[c].length, 0);
  }

  // Lista delle e-mail autorizzate (documento config/access)
  async getAllowed() {
    const s = await this.m.getDoc(this.m.doc(this.db, 'config', 'access'));
    return s.exists() && Array.isArray(s.data().emails) ? s.data().emails : [];
  }
  async addAllowed(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error('Indirizzo e-mail non valido.');
    await this.m.updateDoc(this.m.doc(this.db, 'config', 'access'), { emails: this.m.arrayUnion(e) });
  }
  async removeAllowed(email) {
    await this.m.updateDoc(this.m.doc(this.db, 'config', 'access'), { emails: this.m.arrayRemove(String(email).toLowerCase()) });
  }
}

export function createStore() {
  return cloudConfigured() && !isLocalOnlyChosen() ? new CloudStore() : new LocalStore();
}
