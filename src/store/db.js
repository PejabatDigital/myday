/* Thin promise wrapper around IndexedDB.
   Schema changes go through VERSION and upgrade() — never edit an existing step, add a new one. */
export const VERSION = 1;

function upgrade(db, oldVersion){
  if (oldVersion < 1){
    db.createObjectStore("days", {keyPath:"date"});         // day docs, keyed by YYYY-MM-DD
    db.createObjectStore("weeks", {keyPath:"weekStart"});   // week notes, keyed by Monday's date
    db.createObjectStore("outbox", {keyPath:"key"});        // docs changed on this device, not yet synced
  }
}

export function openDB(name){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = e => upgrade(req.result, e.oldVersion);
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

/* Runs fn(transaction) and resolves once the transaction has committed.
   If fn returns a request, its result is what the promise resolves with. */
export function tx(db, stores, mode, fn){
  return new Promise((resolve, reject)=>{
    const t = db.transaction(stores, mode, mode==="readwrite" ? {durability:"strict"} : undefined);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Storage write was cancelled"));
    const req = fn(t);
    if (req) req.onsuccess = () => { result = req.result; };
  });
}
