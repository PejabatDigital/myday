/* Local store: IndexedDB is the source of truth on this device.

   Every write also
   - marks the doc in the outbox, so the sync step can push it later, and
   - is first copied to localStorage ("dp:pending:<store>:<id>"), synchronously. The copy is
     removed once IndexedDB has committed. If the page is killed mid-write (iOS suspends
     backgrounded apps without warning), the next launch replays it. */
import { openDB, tx } from "./db.js";

const PENDING = "dp:pending:";
const MIGRATED = "dp:migrated-to-idb";
const STORES = ["days", "weeks"];
const KEYS = {days:"date", weeks:"weekStart"};

let db = null;

const ls = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(e){} },
  del(k){ try { localStorage.removeItem(k); } catch(e){} },
  keys(){ try { const out=[]; for (let i=0;i<localStorage.length;i++) out.push(localStorage.key(i)); return out; } catch(e){ return []; } }
};
const newer = (a,b) => (a.updatedAt||"") > (b.updatedAt||"");

export async function initStore({name="myday"}={}){
  if (db) db.close();
  db = await openDB(name);
  await migrateLocalStorage();
  await flushPending();
}

function read(store, id){ return tx(db, [store], "readonly", t=>t.objectStore(store).get(id)).then(d=>d||null); }

function write(store, id, doc){
  const key = store+":"+id, json = JSON.stringify(doc);
  ls.set(PENDING+key, json);
  return tx(db, [store,"outbox"], "readwrite", t=>{
    t.objectStore(store).put(doc);
    t.objectStore("outbox").put({key, store, id, at:doc.updatedAt||new Date().toISOString()});
  }).then(()=>{ if (ls.get(PENDING+key)===json) ls.del(PENDING+key); });
}

/* Day docs: { date, dayNote, updatedAt, tasks:[…] } */
export const readDay = date => read("days", date);
export const writeDay = (date, doc) => write("days", date, {...doc, date});
export function readDays(lo, hi){ // inclusive lo, exclusive hi
  if (!(lo < hi)) return Promise.resolve([]);
  return tx(db, ["days"], "readonly", t=>t.objectStore("days").getAll(IDBKeyRange.bound(lo, hi, false, true)));
}

/* Week notes: { weekStart, note, updatedAt } */
export const readWeek = weekStart => read("weeks", weekStart);
export const writeWeek = (weekStart, doc) => write("weeks", weekStart, {...doc, weekStart});

/* ---------- sync (see src/sync.js) ---------- */
/* Docs changed on this device since they were last synced: [{key, store, id, at}]. */
export function outbox(){ return tx(db, ["outbox"], "readonly", t=>t.objectStore("outbox").getAll()); }

export const readDoc = (store, id) => read(store, id);
export const writeDoc = (store, id, doc) => write(store, id, doc);
export function readAll(store){ return tx(db, [store], "readonly", t=>t.objectStore(store).getAll()); }

/* The server has this doc: clears its outbox entry, unless it was edited again meanwhile. */
export function markSent(entry){
  return tx(db, ["outbox"], "readwrite", t=>{
    const o = t.objectStore("outbox"), req = o.get(entry.key);
    req.onsuccess = () => { if (req.result && req.result.at===entry.at) o.delete(entry.key); };
  });
}

/* Stores a doc that came from the server, unless this device holds the same or a newer edit.
   Resolves true if it was stored. */
export function applyRemote(store, doc){
  const id = doc[KEYS[store]], key = store+":"+id;
  let applied = false;
  return tx(db, [store,"outbox"], "readwrite", t=>{
    const req = t.objectStore(store).get(id);
    req.onsuccess = () => {
      if (req.result && !newer(doc, req.result)) return;
      t.objectStore(store).put(doc);
      t.objectStore("outbox").delete(key); // an older unsent edit here lost to the newer one
      applied = true;
    };
  }).then(()=>applied);
}

/* Marks every doc on this device to be uploaded, except the given keys ("days:2026-10-15"). */
export function queueAll(except){
  return tx(db, [...STORES,"outbox"], "readwrite", t=>{
    STORES.forEach(store=>{
      const req = t.objectStore(store).getAll();
      req.onsuccess = () => req.result.forEach(doc=>{
        const id = doc[KEYS[store]], key = store+":"+id;
        if (!except.has(key)) t.objectStore("outbox").put({key, store, id, at:doc.updatedAt||""});
      });
    });
  });
}

/* Writes any copies left in localStorage by a write that never committed — unless IndexedDB
   already holds the same or a newer version. Runs on launch; safe to call any time. */
export async function flushPending(){
  for (const k of ls.keys().filter(k=>k && k.startsWith(PENDING))){
    const rest = k.slice(PENDING.length), i = rest.indexOf(":");
    const store = rest.slice(0,i), id = rest.slice(i+1);
    let doc = null; try { doc = JSON.parse(ls.get(k)); } catch(e){}
    if (!STORES.includes(store) || !id || !doc || typeof doc!=="object"){ ls.del(k); continue; }
    const cur = await read(store, id);
    if (!cur || newer(doc, cur)) await write(store, id, doc);
    else ls.del(k);
  }
}

/* One-off: move data saved by the localStorage version of the app into IndexedDB.
   Never overwrites a doc IndexedDB already has. The old keys are left in place as a backup. */
async function migrateLocalStorage(){
  if (ls.get(MIGRATED)) return;
  for (const k of ls.keys()){
    let m, x = null;
    try { x = JSON.parse(ls.get(k)); } catch(e){}
    if (!x || typeof x!=="object") continue;
    if ((m = /^dp:day:(\d{4}-\d{2}-\d{2})$/.exec(k))){
      if (!(await read("days", m[1]))) await writeDay(m[1], x);
    } else if ((m = /^dp:week:(\d{4}-\d{2}-\d{2})$/.exec(k))){
      const doc = {note:String(x.note||"")}; if (x.updatedAt) doc.updatedAt = x.updatedAt;
      if (!(await read("weeks", m[1]))) await writeWeek(m[1], doc);
    }
  }
  ls.set(MIGRATED, new Date().toISOString());
}
