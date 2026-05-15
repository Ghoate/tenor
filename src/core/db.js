'use strict';

/* ── DB ─────────────────────────────────────────────── */
const DB_NAME = 'daily-log-v2', DB_VERSION = 1;
let db;
let useLocalStorage = false; // set true when IndexedDB is unavailable

/* ── localStorage fallback ──────────────────────────── */
// Data layout: 'dl_entries' => [{id,date,...},...], 'dl_settings' => [{key,value},...}]
// IDs are assigned using 'dl_next_id' counter.
const LS_ENTRIES  = 'dl_entries';
const LS_SETTINGS = 'dl_settings';
const LS_NEXT_ID  = 'dl_next_id';

function lsRead(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) { return null; }
}
function lsWrite(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.error('localStorage write failed', e); }
}
function lsNextId() {
  const n = (lsRead(LS_NEXT_ID) || 0) + 1;
  lsWrite(LS_NEXT_ID, n);
  return n;
}
function lsGetEntries()  { return lsRead(LS_ENTRIES)  || []; }
function lsGetSettings() { return lsRead(LS_SETTINGS) || []; }
function lsSaveEntries(arr)  { lsWrite(LS_ENTRIES, arr); }
function lsSaveSettings(arr) { lsWrite(LS_SETTINGS, arr); }

/* ── Unified DB API ─────────────────────────────────── */
function openDB() {
  return new Promise((res, rej) => {
    // Check if IndexedDB is available at all
    if (!window.indexedDB) {
      console.warn('Daily Log: IndexedDB not available, falling back to localStorage.');
      useLocalStorage = true;
      return res();
    }
    let timedOut = false;
    // Some browsers (e.g. file:// in certain configs) block IDB silently — use a timeout guard
    const timer = setTimeout(() => {
      timedOut = true;
      console.warn('Daily Log: IndexedDB timed out, falling back to localStorage.');
      useLocalStorage = true;
      res();
    }, 2000);

    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch(e) {
      clearTimeout(timer);
      console.warn('Daily Log: IndexedDB open threw, falling back to localStorage.', e);
      useLocalStorage = true;
      return res();
    }

    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('entries')) {
        d.createObjectStore('entries', { keyPath: 'id', autoIncrement: true })
          .createIndex('date', 'date', { unique: false });
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => {
      if (timedOut) return; // already resolved via fallback
      clearTimeout(timer);
      db = e.target.result;
      // Safari private browsing: IDB opens but write quota is 0 — test with a write
      try {
        const testTx = db.transaction('settings', 'readwrite');
        const testReq = testTx.objectStore('settings').put({key:'__test__', value:1});
        testReq.onsuccess = () => res(); // write succeeded — IDB is usable
        testReq.onerror = () => {
          console.warn('Daily Log: IDB write test failed (Safari private?), falling back to localStorage.');
          useLocalStorage = true;
          res();
        };
        testTx.onerror = () => {
          useLocalStorage = true;
          res();
        };
      } catch(err) {
        console.warn('Daily Log: IDB write test threw, falling back to localStorage.', err);
        useLocalStorage = true;
        res();
      }
    };
    req.onerror = () => {
      if (timedOut) return;
      clearTimeout(timer);
      console.warn('Daily Log: IndexedDB error, falling back to localStorage.', req.error);
      useLocalStorage = true;
      res();
    };
    req.onblocked = () => {
      if (timedOut) return;
      clearTimeout(timer);
      console.warn('Daily Log: IndexedDB blocked, falling back to localStorage.');
      useLocalStorage = true;
      res();
    };
  });
}

function tx(store, mode) {
  if (!db) throw new Error('Daily Log: DB not ready');
  return db.transaction(store, mode).objectStore(store);
}

function dbGet(store, key) {
  if (useLocalStorage) {
    if (store === 'settings') {
      const all = lsGetSettings();
      return Promise.resolve(all.find(r => r.key === key) || undefined);
    }
    const all = lsGetEntries();
    return Promise.resolve(all.find(r => r.id === key) || undefined);
  }
  return new Promise((r,j) => { const q=tx(store,'readonly').get(key); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
}

function dbPut(store, val) {
  if (useLocalStorage) {
    if (store === 'settings') {
      const all = lsGetSettings();
      const idx = all.findIndex(r => r.key === val.key);
      idx >= 0 ? all[idx] = val : all.push(val);
      lsSaveSettings(all);
      return Promise.resolve(val.key);
    }
    // entries store
    const all = lsGetEntries();
    if (!val.id) val = { ...val, id: lsNextId() };
    const idx = all.findIndex(r => r.id === val.id);
    idx >= 0 ? all[idx] = val : all.push(val);
    lsSaveEntries(all);
    return Promise.resolve(val.id);
  }
  return new Promise((r,j) => {
    try {
      const q = tx(store,'readwrite').put(val);
      q.onsuccess = () => r(q.result);
      q.onerror   = () => j(q.error);
    } catch(e) {
      console.warn('Daily Log: dbPut failed, trying localStorage fallback.', e);
      useLocalStorage = true;
      dbPut(store, val).then(r).catch(j);
    }
  });
}

function dbDel(store, key) {
  if (useLocalStorage) {
    if (store === 'settings') {
      lsSaveSettings(lsGetSettings().filter(r => r.key !== key));
    } else {
      lsSaveEntries(lsGetEntries().filter(r => r.id !== key));
    }
    return Promise.resolve();
  }
  return new Promise((r,j) => { const q=tx(store,'readwrite').delete(key); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });
}

function dbAll(store) {
  if (useLocalStorage) {
    return Promise.resolve(store === 'settings' ? lsGetSettings() : lsGetEntries());
  }
  return new Promise((r,j) => { const q=tx(store,'readonly').getAll(); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
}

function dbByIdx(store, idx, val) {
  if (useLocalStorage) {
    // Only 'entries' store has an index ('date')
    const all = lsGetEntries();
    return Promise.resolve(all.filter(r => r[idx] === val));
  }
  return new Promise((r,j) => { const q=tx(store,'readonly').index(idx).getAll(val); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
}
