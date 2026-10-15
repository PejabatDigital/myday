/* Sync: keeps this device's storage and the signed-in person's online storage in step.

   - Sends up every doc in the outbox (changed here since the last sync), then pulls down
     everything changed elsewhere since the last change number this device saw.
   - Latest edit wins, a whole day (or week note) at a time, by updatedAt. The server refuses
     an older edit (409) and returns its copy, which replaces ours.
   - A device's first sync for a person combines instead: a day that's both here and online
     keeps every task from both, and both notes. Then everything here is uploaded.
   - Runs on start, on return to the app, on reconnect, every 30 s while open, and a moment
     after each save. */
import { outbox, readDoc, writeDoc, readAll, markSent, applyRemote, queueAll } from "./store/index.js";
import { normalize, combineDays, joinNotes } from "./day.js";

const STATE = "dp:sync"; // {user, cursor}: who this device last synced as, and the last change number seen
const EVERY = 30000, SOON = 2000, SHOW_SYNCING_AFTER = 500;
const EPOCH = new Date(0).toISOString(); // for docs saved before updatedAt existed: any real edit wins

const loadState = () => { try { return JSON.parse(localStorage.getItem(STATE)) || {}; } catch(e){ return {}; } };
const saveState = s => { try { localStorage.setItem(STATE, JSON.stringify(s)); } catch(e){} };

class AuthError extends Error {}
class OfflineError extends Error {}
class ServerError extends Error {}

async function api(method, path, body){
  let r;
  try {
    r = await fetch(path, {method, headers: body ? {"content-type":"application/json"} : {},
      body: body ? JSON.stringify(body) : undefined, cache:"no-store"});
  } catch(e){ throw new OfflineError("offline"); }
  if (r.status===401) throw new AuthError("signed out");
  const d = await r.json().catch(()=>({}));
  if (r.status===409) return {conflict:true, server:d.server};
  if (!r.ok) throw new ServerError(path+" "+r.status+(d.error ? " "+d.error : ""));
  return d;
}

/* What the API expects for each kind of doc. */
const toServer = {
  days: doc => ({...normalize(doc, doc.date), updatedAt: doc.updatedAt || EPOCH}),
  weeks: doc => ({note: String(doc.note||""), updatedAt: doc.updatedAt || EPOCH}),
};
const fromServer = {
  days: ({version, ...doc}) => doc,
  weeks: ({version, ...doc}) => doc,
};

/* hooks: user() → {id} or null; beforeSync() saves anything pending on screen;
   onRemote({days, weeks}) after docs here were replaced; onStatus(status) with
   "synced" | "syncing" | "offline" | "error"; onSignedOut() when the session has ended. */
export function createSync(hooks){
  let running = null, again = false, soonTimer = null, timer = null, started = false;

  async function pull(since, changed){
    let cursor = since;
    for (;;){
      const d = await api("GET", "/api/changes?since="+cursor+"&limit=200");
      for (const store of ["days","weeks"]) for (const doc of d[store]){
        const clean = fromServer[store](doc);
        if (await applyRemote(store, clean)) changed[store].push(clean);
      }
      cursor = d.cursor;
      if (!d.more) return cursor;
    }
  }

  /* First sync for this person on this device: combine what's online with what's here. */
  async function firstSync(changed){
    const online = {days:[], weeks:[]};
    let cursor = 0;
    for (;;){
      const d = await api("GET", "/api/changes?since="+cursor+"&limit=200");
      online.days.push(...d.days); online.weeks.push(...d.weeks);
      cursor = d.cursor;
      if (!d.more) break;
    }
    const same = new Set(); // keys already identical online, so not uploaded again
    for (const store of ["days","weeks"]) for (const doc of online[store]){
      const theirs = fromServer[store](doc), id = store==="days" ? theirs.date : theirs.weekStart;
      const mine = await readDoc(store, id);
      if (!mine){ if (await applyRemote(store, theirs)) changed[store].push(theirs); same.add(store+":"+id); continue; }
      const both = store==="days" ? combineDays(mine, theirs)
        : (n => n===(mine.note||"") ? null : {weekStart:id, note:n, updatedAt:new Date().toISOString()})(joinNotes(mine.note, theirs.note));
      if (both){ await writeDoc(store, id, both); changed[store].push(both); }
      else if (JSON.stringify(toServer[store](mine))===JSON.stringify(toServer[store](theirs))) same.add(store+":"+id);
    }
    await queueAll(same);
    return cursor;
  }

  async function push(changed){
    let failed = null;
    for (const entry of await outbox()){
      const doc = await readDoc(entry.store, entry.id);
      if (!doc){ await markSent(entry); continue; }
      try {
        const r = await api("PUT", "/api/"+entry.store+"/"+entry.id, toServer[entry.store](doc));
        if (r.conflict && r.server){ // a newer edit is online: it wins
          const theirs = fromServer[entry.store](r.server);
          if (await applyRemote(entry.store, theirs)) changed[entry.store].push(theirs);
        }
        await markSent(entry);
      } catch(e){
        if (!(e instanceof ServerError)) throw e; // offline or signed out: stop here
        console.warn("MyDay sync: couldn't send", entry.key, e.message); // try the rest, report it
        failed = e;
      }
    }
    if (failed) throw failed;
  }

  async function once(){
    const user = hooks.user();
    if (!user) return;
    if (!navigator.onLine){ hooks.onStatus("offline"); return; }
    const slow = setTimeout(()=>hooks.onStatus("syncing"), SHOW_SYNCING_AFTER);
    const changed = {days:[], weeks:[]};
    try {
      await hooks.beforeSync();
      let state = loadState();
      if (state.user!==user.id){
        const cursor = await firstSync(changed);
        state = {user:user.id, cursor};
        saveState(state);
      }
      await push(changed);
      state.cursor = await pull(state.cursor||0, changed);
      saveState(state);
      hooks.onStatus("synced");
    } catch(e){
      if (e instanceof AuthError){ hooks.onSignedOut(); return; }
      const offline = e instanceof OfflineError || !navigator.onLine;
      hooks.onStatus(offline ? "offline" : "error");
      if (!offline) console.warn("MyDay sync:", e);
    } finally {
      clearTimeout(slow);
      if (changed.days.length || changed.weeks.length) hooks.onRemote(changed);
    }
  }

  /* Runs a sync now; if one is already running, runs another straight after it. */
  function run(){
    if (!started) return Promise.resolve();
    if (running){ again = true; return running; }
    running = (async ()=>{
      do { again = false; await once(); } while (again && started);
      running = null;
    })();
    return running;
  }

  const onVisible = () => { if (document.visibilityState==="visible") run(); };
  const onOnline = () => run();
  const onOffline = () => hooks.onStatus("offline");

  return {
    start(){
      if (started) return;
      started = true;
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      timer = setInterval(()=>{ if (document.visibilityState==="visible") run(); }, EVERY);
      run();
    },
    stop(){
      started = false;
      clearInterval(timer); clearTimeout(soonTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    },
    run,
    /* After a save: sync a moment later, so a burst of typing goes up together. */
    soon(){ if (!started) return; clearTimeout(soonTimer); soonTimer = setTimeout(run, SOON); },
  };
}
