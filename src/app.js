import { initStore, readDay, writeDay, readDays, readWeek, writeWeek, flushPending } from "./store/index.js";
import { registerSW } from "./pwa.js";
import { currentUser, signOut } from "./account.js";

(function(){
"use strict";
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); };
const addDays = (s,n) => { const d = parse(s); d.setDate(d.getDate()+n); return iso(d); };
const todayISO = () => iso(new Date());
const fmtShort = s => parse(s).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
const uid = () => Math.random().toString(36).slice(2,10);
const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,v); } catch(e){} };

const ICON_NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3.5h9l3.5 3.5V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M9 11h6M9 15h4"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>';

function emptyDay(date){ return {date, tasks:[], dayNote:""}; }
function normalize(d, date){
  d = d ? JSON.parse(JSON.stringify(d)) : {};
  const out = {date, tasks:[], dayNote: typeof d.dayNote==="string" ? d.dayNote : ""};
  if (Array.isArray(d.tasks)) out.tasks = d.tasks.filter(t=>t && t.id).map(t=>({
    id:String(t.id), text:String(t.text||""), status:["open","done","missed","cf"].includes(t.status)?t.status:"open",
    reason:String(t.reason||""), note:String(t.note||""), from:t.from||null, carried:t.carried||null }));
  if (d.updatedAt) out.updatedAt = d.updatedAt;
  return out;
}

const S = { mode:"loading", date:todayISO(), target:todayISO(), day:null, noteTarget:"day",
  paneOpen: lsGet("dp:pane")==="1", dirty:false, pendingRender:false, week:{}, carryIn:[],
  view: lsGet("dp:view")==="month" ? "month" : "day", monthKey:null, monthDays:{} };
const monthOf = d => d.slice(0,7);
const errMsg = e => e && e.message || "unknown error";

/* ---------- storage (IndexedDB on this device, see src/store/) ---------- */
async function getDay(date){ const d = await readDay(date); return d ? normalize(d,date) : emptyDay(date); }
function putDay(date, body){
  S.monthDays[date] = body;
  return writeDay(date, body);
}
async function queryDays(lo, hi){ // inclusive lo, exclusive hi
  return (await readDays(lo, hi)).map(d=>normalize(d, d.date));
}

/* ---------- saving ---------- */
/* Saves run one after another, so they land in order. Each one snapshots its doc when queued. */
let saveTimer=null, saving=Promise.resolve(), retryTimer=null;
function changed(delay){
  S.dirty = true; S.week[S.date] = tally(S.day);
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, delay==null?500:delay);
  renderCounts(); renderWeek(); renderEod(); scheduleMonth();
}
let monthTimer=null;
function scheduleMonth(){ if (S.view!=="month") return; clearTimeout(monthTimer); monthTimer=setTimeout(renderMonth,250); }
function queueSave(write){
  saving = saving.then(write).then(()=>setFoot(), e=>{
    setFoot("Couldn't save on this device ("+errMsg(e)+"). Retrying…");
    // the failed write is still held in localStorage; flushPending retries it without overwriting anything newer
    if (!retryTimer) retryTimer = setTimeout(()=>{ retryTimer = null; queueSave(flushPending); }, 3000);
  });
  return saving;
}
function flush(){
  clearTimeout(saveTimer);
  if (!S.dirty || !S.day) return saving;
  S.dirty = false;
  S.day.updatedAt = new Date().toISOString();
  const date = S.date, body = JSON.parse(JSON.stringify(S.day));
  return queueSave(()=>putDay(date, body));
}
document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState==="hidden"){ flush(); flushWeek(); } });
window.addEventListener("pagehide", ()=>{ flush(); flushWeek(); });

/* ---------- loading a day ---------- */
let openSeq = 0;
async function openDay(date){
  const seq = ++openSeq, wk = weekStart(date);
  S.target = date; // the day being opened; prev/next step from here so quick taps add up
  if (S.day) await flush();
  let day, week;
  try { [day, week] = await Promise.all([getDay(date), S.wk.key===wk ? null : readWeek(wk)]); }
  catch(e){ if (seq===openSeq){ S.target = S.date; setFoot("Couldn't open "+fmtShort(date)+" ("+errMsg(e)+")."); } return; }
  if (seq!==openSeq) return; // a later openDay won
  flush(); // anything typed while loading belongs to the day we're leaving
  S.date = date; S.day = day; S.noteTask = null; S.carryIn = [];
  if (S.wk.key!==wk){ flushWeek(); S.wk = {key:wk, note: week ? String(week.note||"") : "", dirty:false}; }
  if (S.view==="month") ensureMonth(monthOf(date));
  renderAll();
  loadWeek(); loadCarryIn();
}
function isEditing(){ const a = document.activeElement; return a && (a.tagName==="TEXTAREA"||a.tagName==="INPUT"||a.isContentEditable) && a.id!=="pick"; }
document.addEventListener("focusout", ()=>{ setTimeout(()=>{ if (S.pendingRender && !isEditing()){ S.pendingRender=false; renderAll(); } }, 0); });

function monthRange(key){
  const first = key+"-01", lo = weekStart(first);
  const last = parse(first); last.setMonth(last.getMonth()+1); last.setDate(0);
  return {lo, hi: addDays(weekStart(iso(last)),7)};
}
function ensureMonth(key){
  if (S.monthKey===key) return;
  S.monthKey = key; S.monthDays = {};
  const {lo,hi} = monthRange(key);
  queryDays(lo,hi).then(days=>{ if (S.monthKey!==key) return; days.forEach(d=>{ if (!(d.date in S.monthDays)) S.monthDays[d.date]=d; }); renderMonth(); }).catch(()=>{});
}
function renderMonth(){
  $("month").hidden = S.view!=="month";
  if (S.view!=="month" || !S.monthKey) return;
  const g = $("mgrid"); g.textContent = "";
  const {lo,hi} = monthRange(S.monthKey), td = todayISO();
  for (let ds=lo; ds<hi; ds=addDays(ds,1)){
    const day = (ds===S.date && S.day) ? S.day : S.monthDays[ds];
    const tasks = day ? day.tasks.filter(t=>t.text.trim()) : [];
    const c = document.createElement("button");
    c.className = "mc"+(monthOf(ds)!==S.monthKey?" out":"")+(ds===td?" today":"")+(ds===S.date?" sel":"");
    const done = tasks.filter(t=>t.status==="done").length;
    c.setAttribute("aria-label", parse(ds).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})+(tasks.length?`, ${done} of ${tasks.length} done`:", no tasks"));
    const top = document.createElement("div"); top.className="mtop";
    const md = document.createElement("span"); md.className="md"; md.textContent = parse(ds).getDate();
    const mn = document.createElement("span"); mn.className="mn"; mn.textContent = tasks.length ? `${done}/${tasks.length}` : "";
    top.append(md,mn); c.append(top);
    const SHOW = 4;
    tasks.slice(0,SHOW).forEach(t=>{ const r=document.createElement("div"); r.className="mt "+t.status;
      const i=document.createElement("i"); i.textContent = t.status==="done"?"✓":t.status==="missed"?"✕":t.status==="cf"?"→":"·";
      r.append(i, document.createTextNode(t.text)); c.append(r); });
    if (tasks.length>SHOW){ const m=document.createElement("div"); m.className="more"; m.textContent = `+${tasks.length-SHOW} more`; c.append(m); }
    if (tasks.length){ const dots=document.createElement("div"); dots.className="dots";
      tasks.slice(0,8).forEach(t=>{ const b=document.createElement("b"); b.className=t.status; dots.append(b); }); c.append(dots); }
    c.onclick = ()=>{ if (ds!==S.date) openDay(ds); };
    c.ondblclick = ()=>setView("day");
    g.append(c);
  }
}
function setView(v){
  S.view = v; lsSet("dp:view", v);
  if (v==="month") ensureMonth(monthOf(S.date));
  renderAll();
}
function shiftMonth(n){
  const d = parse(S.monthKey+"-01"); d.setMonth(d.getMonth()+n);
  const key = iso(d).slice(0,7), td = todayISO();
  openDay(monthOf(td)===key ? td : key+"-01");
}

function weekStart(date){ const d = parse(date); const off = (d.getDay()+6)%7; d.setDate(d.getDate()-off); return iso(d); }
async function loadWeek(){
  const lo = weekStart(S.date), hi = addDays(lo,7), want = S.date;
  try { const days = await queryDays(lo,hi); if (want!==S.date) return;
    days.forEach(d=>{ if (d.date!==S.date) S.week[d.date]=tally(d); }); renderWeek(); } catch(e){}
}
async function loadCarryIn(){
  const want = S.date;
  if (want < todayISO()){ S.carryIn=[]; renderCarryIn(); return; }
  try {
    const days = await queryDays(addDays(want,-10), want);
    if (want!==S.date) return;
    S.carryIn = days.sort((a,b)=>a.date<b.date?-1:1).map(d=>({date:d.date, tasks:d.tasks.filter(t=>t.status==="cf" && !t.carried)})).filter(x=>x.tasks.length);
    renderCarryIn();
  } catch(e){}
}

/* ---------- carry forward ---------- */
function cloneForward(t, fromDate){ return {id:uid(), text:t.text, status:"open", reason:"", note:t.note||"", from:fromDate, carried:null}; }
async function bringOver(){
  const groups = S.carryIn; if (!groups.length) return;
  for (const g of groups){
    g.tasks.forEach(t=>S.day.tasks.push(cloneForward(t, g.date)));
  }
  changed(0); await flush();
  for (const g of groups){
    try { const src = await getDay(g.date); const ids = new Set(g.tasks.map(t=>t.id));
      src.tasks.forEach(t=>{ if (ids.has(t.id)) t.carried = S.date; });
      src.updatedAt = new Date().toISOString(); await putDay(g.date, src); } catch(e){}
  }
  S.carryIn = []; renderAll(); loadWeek();
}
async function sendForward(){
  const items = S.day.tasks.filter(t=>t.status==="cf" && !t.carried); if (!items.length) return;
  const to = addDays(S.date,1);
  try {
    const target = await getDay(to);
    items.forEach(t=>target.tasks.push(cloneForward(t, S.date)));
    target.updatedAt = new Date().toISOString();
    await putDay(to, target);
    items.forEach(t=>t.carried = to);
    S.week[to] = tally(target);
    changed(0); renderAll();
  } catch(e){ setFoot("Couldn't carry forward: "+(e&&e.message||"try again")); }
}

/* ---------- rendering ---------- */
function tally(d){ const c={total:0,done:0,missed:0,cf:0,open:0}; (d.tasks||[]).forEach(t=>{ if(!t.text.trim()) return; c.total++; c[t.status]++; }); return c; }
function renderAll(){ renderHeader(); renderWeek(); renderMonth(); renderCarryIn(); renderList(); renderEod(); renderCounts(); renderNotes(); }

function renderHeader(){
  const d = parse(S.date), m = S.view==="month";
  $("dow").textContent = m ? "Month" : d.toLocaleDateString("en-GB",{weekday:"long"});
  $("title").textContent = "";
  $("title").append(m ? d.toLocaleDateString("en-GB",{month:"long"}) : d.toLocaleDateString("en-GB",{day:"numeric",month:"long"}));
  const yr = document.createElement("span"); yr.className="yr"; yr.textContent = d.getFullYear(); $("title").append(yr);
  $("todayTag").hidden = m || S.date!==todayISO();
  $("vDay").setAttribute("aria-pressed", !m); $("vMonth").setAttribute("aria-pressed", m);
  $("prev").setAttribute("aria-label", m?"Previous month":"Previous day"); $("next").setAttribute("aria-label", m?"Next month":"Next day");
  $("pageLabel").textContent = m ? parse(S.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"}) : "To do";
  $("openDayBtn").hidden = !m;
  document.body.classList.toggle("mview", m);
  $("pick").value = S.date;
  $("notesBtn").classList.toggle("on", S.paneOpen); $("notesBtn").setAttribute("aria-pressed", S.paneOpen);
}
function renderWeek(){
  const w = $("week"); w.textContent = ""; w.hidden = S.view==="month"; const lo = weekStart(S.date), td = todayISO();
  for (let i=0;i<7;i++){
    const ds = addDays(lo,i), d = parse(ds), c = S.week[ds];
    const b = document.createElement("button"); b.className = "wd"+(ds===S.date?" sel":"")+(ds===td?" today":"");
    b.setAttribute("aria-label", d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}));
    const l = document.createElement("span"); l.className="l"; l.textContent = d.toLocaleDateString("en-GB",{weekday:"short"});
    const n = document.createElement("span"); n.className="n"; n.textContent = d.getDate();
    const k = document.createElement("span"); k.className="c"; k.textContent = c && c.total ? `${c.done}/${c.total}` : "";
    b.append(l,n,k); b.onclick = ()=>{ if (ds!==S.date) openDay(ds); };
    w.append(b);
  }
}
function renderCounts(){
  const c = tally(S.day||emptyDay(S.date));
  $("counts").textContent = c.total ? `${c.done} of ${c.total} done` : "";
}
function renderCarryIn(){
  const box = $("carryIn"); box.textContent = "";
  if (!S.carryIn.length) return;
  const n = S.carryIn.reduce((a,g)=>a+g.tasks.length,0);
  const wrap = document.createElement("div"); wrap.className = "carry-in";
  const hd = document.createElement("div"); hd.className="hd";
  const lab = document.createElement("span"); lab.className="label"; lab.style.color="var(--pen)"; lab.textContent = `${n} carried forward (cf)`;
  const btn = document.createElement("button"); btn.className="btn pen"; btn.textContent = "Bring onto this page"; btn.onclick = bringOver;
  hd.append(lab,btn);
  const ul = document.createElement("ul");
  S.carryIn.forEach(g=>g.tasks.forEach(t=>{
    const li = document.createElement("li");
    const s = document.createElement("span"); s.className="src"; s.textContent = fmtShort(g.date);
    const tx = document.createElement("span"); tx.className="t"; tx.textContent = t.text;
    li.append(s,tx); ul.append(li);
  }));
  wrap.append(hd,ul); box.append(wrap);
}

function autosize(ta){ ta.style.height = "auto"; ta.style.height = ta.scrollHeight+"px"; }
function boxGlyph(st){ return st==="done"?"✓":st==="missed"?"✕":st==="cf"?"cf":""; }

/* open tasks stay on top; ticked, not-done and cf tasks sink below.
   A task that was just marked lands right under the open ones; one just reopened goes to the end of the open ones. */
const isMarked = t=>t.status!=="open";
const lastMarked = new Map();
function settleOrder(){
  const open=[], reopened=[], justMarked=[], marked=[];
  S.day.tasks.forEach(t=>{ const was = lastMarked.get(t.id), m = isMarked(t);
    (m ? (was===false ? justMarked : marked) : (was===true ? reopened : open)).push(t); });
  S.day.tasks = open.concat(reopened, justMarked, marked);
  S.day.tasks.forEach(t=>lastMarked.set(t.id, isMarked(t)));
}
function slideRows(ul, before){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  ul.querySelectorAll(".row[data-id]").forEach(r=>{
    const y = before[r.dataset.id]; if (y==null) return;
    const dy = y - r.getBoundingClientRect().top; if (Math.abs(dy)<2) return;
    r.animate([{transform:`translateY(${dy}px)`},{transform:"none"}],{duration:260,easing:"cubic-bezier(.2,.8,.2,1)"});
  });
}
function renderList(focusId, caretEnd){
  const wrap = $("listWrap");
  if (S.mode==="loading") wrap.textContent = "";
  if (S.mode==="loading"){ const l=document.createElement("div"); l.className="loading"; l.textContent="Opening your page…"; wrap.append(l); return; }
  const before = {}; wrap.querySelectorAll(".row[data-id]").forEach(r=>before[r.dataset.id]=r.getBoundingClientRect().top);
  wrap.textContent = "";
  settleOrder();
  const ul = document.createElement("ul"); ul.className = "list";
  S.day.tasks.forEach((t,i)=>ul.append(taskRow(t,i)));
  ul.append(adderRow());
  wrap.append(ul);
  if (!S.day.tasks.length){
    const e = document.createElement("div"); e.className="empty"; e.textContent = "Nothing on this page yet. Type your first task above and press Enter for the next one.";
    wrap.append(e);
  }
  ul.querySelectorAll("textarea.t").forEach(autosize);
  slideRows(ul, before);
  if (focusId){
    const el = ul.querySelector(`[data-id="${focusId}"] textarea.t`) || (focusId==="__add" && ul.querySelector(".adder textarea"));
    if (el){ el.focus(); const p = caretEnd===false?0:el.value.length; el.setSelectionRange(p,p); }
  }
}

function taskRow(t,i){
  const li = document.createElement("li"); li.className = "row "+t.status; li.dataset.id = t.id;
  const box = document.createElement("button"); box.className="box";
  box.setAttribute("aria-label", t.status==="done" ? "Mark not finished" : "Mark done");
  const sp = document.createElement("span"); sp.textContent = boxGlyph(t.status); box.append(sp);
  box.onclick = ()=>{ t.status = t.status==="open" ? "done" : "open"; if (t.status!=="cf") t.carried = null; changed(0); renderList(); };

  const tx = document.createElement("div"); tx.className="txt";
  const ta = document.createElement("textarea"); ta.className="t"; ta.rows=1; ta.value=t.text; ta.id="t-"+t.id;
  ta.setAttribute("aria-label","Task");
  ta.oninput = ()=>{ t.text = ta.value.replace(/\n/g," "); if (ta.value!==t.text) ta.value=t.text; autosize(ta); changed(); };
  ta.onkeydown = e=>onTaskKey(e,t,i,ta);
  tx.append(ta);
  if (t.from){ const f=document.createElement("div"); f.className="from"; f.textContent = "cf from "+fmtShort(t.from); tx.append(f); }
  if (t.status==="missed"){
    const w = document.createElement("label"); w.className="why";
    const b = document.createElement("b"); b.textContent = "Not done";
    const inp = document.createElement("input"); inp.id="r-"+t.id; inp.value=t.reason; inp.placeholder="why? (optional)";
    inp.oninput = ()=>{ t.reason = inp.value; changed(); };
    w.append(b,inp); tx.append(w);
  }

  const acts = document.createElement("div"); acts.className="acts";
  if (t.status==="cf"){ const p=document.createElement("span"); p.className="pill "+(t.carried?"sent":"cf"); p.textContent = t.carried ? "cf → "+fmtShort(t.carried).replace(/^\w+ /,"") : "cf"; acts.append(p); }
  const nb = document.createElement("button"); nb.className="a note"+(hasNote(t.note)?" has":""); nb.innerHTML = ICON_NOTE;
  nb.setAttribute("aria-label", hasNote(t.note) ? "Open note for this task" : "Add a note to this task");
  nb.onclick = ()=>openNote(t.id);
  const mb = document.createElement("button"); mb.className="a"; mb.innerHTML = ICON_MORE; mb.setAttribute("aria-label","More for this task"); mb.setAttribute("aria-haspopup","menu");
  mb.onclick = e=>{ e.stopPropagation(); openMenu(mb,t,i); };
  acts.append(nb,mb);
  li.append(box,tx,acts);
  return li;
}

function adderRow(){
  const li = document.createElement("li"); li.className="row adder";
  const box = document.createElement("div"); box.className="box"; const sp=document.createElement("span"); box.append(sp);
  const tx = document.createElement("div"); tx.className="txt";
  const ta = document.createElement("textarea"); ta.className="t"; ta.rows=1; ta.id="adder"; ta.placeholder = S.day.tasks.length ? "Add another…" : "What needs doing today?";
  ta.setAttribute("aria-label","Add a task");
  ta.oninput = ()=>{
    if (ta.value.includes("\n")){ ta.value = ta.value.replace(/\n/g,""); }
    autosize(ta);
  };
  ta.onkeydown = e=>{
    if (e.key==="Enter" && !e.shiftKey && !e.isComposing){
      e.preventDefault(); const v = ta.value.trim(); if (!v) return;
      S.day.tasks.push({id:uid(),text:v,status:"open",reason:"",note:"",from:null,carried:null});
      changed(0); renderList("__add");
    }
  };
  ta.addEventListener("paste", e=>{
    const text = (e.clipboardData||window.clipboardData).getData("text");
    const lines = text.split(/\r?\n/).map(s=>s.replace(/^\s*(?:[-*•]|\[[ xX]?\]|\d+[.)])\s*/,"").trim()).filter(Boolean);
    if (lines.length>1){ e.preventDefault();
      lines.forEach(l=>S.day.tasks.push({id:uid(),text:l,status:"open",reason:"",note:"",from:null,carried:null}));
      changed(0); renderList("__add"); }
  });
  tx.append(ta); li.append(box,tx,document.createElement("div"));
  return li;
}

function onTaskKey(e,t,i,ta){
  if (e.isComposing) return;
  if (e.key==="Enter" && (e.metaKey||e.ctrlKey)){ e.preventDefault(); t.status = t.status==="done"?"open":"done"; changed(0); renderList(t.id); return; }
  if (e.key==="Enter" && !e.shiftKey){
    e.preventDefault();
    const pos = ta.selectionStart, before = ta.value.slice(0,pos).trim(), after = ta.value.slice(pos).trim();
    if (!ta.value.trim()){ focusAdder(); return; }
    t.text = before || t.text;
    const nt = {id:uid(),text:before?after:"",status:"open",reason:"",note:"",from:null,carried:null};
    S.day.tasks.splice(i+1,0,nt); changed(0); renderList(nt.id, false); return;
  }
  if (e.key==="Backspace" && ta.value==="" ){
    e.preventDefault(); const prev = S.day.tasks[i-1];
    removeTask(t); renderList(prev?prev.id:"__add"); return;
  }
  if (e.key==="ArrowUp" && ta.selectionStart===0 && i>0){ e.preventDefault(); const el=$("t-"+S.day.tasks[i-1].id); el.focus(); }
  if (e.key==="ArrowDown" && ta.selectionEnd===ta.value.length){ e.preventDefault(); const n=S.day.tasks[i+1]; (n?$("t-"+n.id):$("adder")).focus(); }
}
function focusAdder(){ const a=$("adder"); if (a) a.focus(); }
function removeTask(t){ S.day.tasks = S.day.tasks.filter(x=>x!==t); if (S.noteTask===t.id) S.noteTask=null; changed(0); renderNotes(); }

/* ---------- end of day ---------- */
function renderEod(){
  const box = $("eod"); if (!S.day || S.mode==="loading"){ box.hidden=true; return; }
  const c = tally(S.day); box.hidden = !c.total; if (!c.total) return;
  box.textContent = "";
  const hd = document.createElement("div"); hd.className="hd";
  const lab = document.createElement("span"); lab.className="label"; lab.textContent = "End of day";
  const tl = document.createElement("div"); tl.className="tally";
  [["done",c.done,"d"],["not done",c.missed,"m"],["cf",c.cf,"c"],["open",c.open,""]].forEach(([k,v,cls])=>{
    const s=document.createElement("span"); const vv=document.createElement("span"); vv.className="v "+cls; vv.textContent=v;
    const kk=document.createElement("span"); kk.className="k"; kk.textContent=" "+k; s.append(vv,kk); tl.append(s); });
  hd.append(lab,tl); box.append(hd);

  const cfs = S.day.tasks.filter(t=>t.status==="cf" && t.text.trim());
  if (cfs.length){
    const ul = document.createElement("ul"); ul.className="cflist";
    cfs.forEach(t=>{ const li=document.createElement("li"); const s=document.createElement("span"); s.textContent=t.text + (t.carried?"  ✓ on "+fmtShort(t.carried):""); li.append(s); ul.append(li); });
    box.append(ul);
  }
  const acts = document.createElement("div"); acts.className="eod-acts";
  if (c.open){
    const b=document.createElement("button"); b.className="btn"; b.textContent = `Mark ${c.open} unfinished as cf`;
    b.onclick = ()=>{ S.day.tasks.forEach(t=>{ if (t.status==="open" && t.text.trim()) t.status="cf"; }); changed(0); renderList(); };
    acts.append(b);
  }
  const pend = cfs.filter(t=>!t.carried).length;
  if (pend){
    const b=document.createElement("button"); b.className="btn pen"; b.textContent = `Carry ${pend} to ${fmtShort(addDays(S.date,1))}`;
    b.onclick = sendForward; acts.append(b);
  }
  if (acts.childNodes.length) box.append(acts);
  if (!pend && !c.open && cfs.length){ const h=document.createElement("div"); h.className="hint"; h.textContent="All cf items are on the next page."; box.append(h); }
}

/* ---------- notes ---------- */
/* Three kinds of note: one per task, one per day (dayNote), one per week (its own document "week-<Monday>"). */
S.noteScope = ["task","day","week"].includes(lsGet("dp:scope")) ? lsGet("dp:scope") : "day";
S.noteTask = null;
S.wk = {key:null, note:"", dirty:false};
const ed = $("ed");
try { document.execCommand("styleWithCSS", false, false); } catch(e){}

const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const RICH = /<\/?(b|strong|i|em|u|s|strike|del|br|p|div|ul|ol|li|h[1-6]|blockquote|a)\b/i;
const KEEP = {B:1,STRONG:1,I:1,EM:1,U:1,S:1,STRIKE:1,DEL:1,BR:1,P:1,DIV:1,UL:1,OL:1,LI:1,H3:1,BLOCKQUOTE:1,A:1};
const DROP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|META|LINK|TITLE|SVG|MATH|IMG|PICTURE|VIDEO|AUDIO|CANVAS|FORM|INPUT|BUTTON|TEXTAREA|SELECT|TEMPLATE|HEAD)$/;
function clean(html){
  const t = document.createElement("template"); t.innerHTML = html;
  (function walk(node){
    [...node.childNodes].forEach(n=>{
      if (n.nodeType===3) return;
      if (n.nodeType!==1 || DROP.test(n.tagName)){ n.remove(); return; }
      walk(n);
      let tag = n.tagName;
      if (/^H[1-6]$/.test(tag) && tag!=="H3"){ const h=document.createElement("h3"); h.append(...n.childNodes); n.replaceWith(h); return; }
      if (!KEEP[tag]){ n.replaceWith(...n.childNodes); return; }
      const href = tag==="A" ? (n.getAttribute("href")||"") : "";
      const chk = tag==="UL" && n.classList.contains("chk");
      const done = tag==="LI" && n.hasAttribute("data-done");
      [...n.attributes].forEach(a=>n.removeAttribute(a.name));
      if (tag==="A"){ if (/^(https?:|mailto:)/i.test(href)) n.setAttribute("href", href); else { n.replaceWith(...n.childNodes); return; } }
      if (chk) n.className = "chk";
      if (done) n.setAttribute("data-done","");
    });
  })(t.content);
  return t.innerHTML;
}
function toHtml(s){ if (!s) return ""; return RICH.test(s) ? clean(s) : esc(s).replace(/\n/g,"<br>"); }
function hasNote(s){ if (!s) return false; if (!RICH.test(s)) return !!s.trim(); const t=document.createElement("template"); t.innerHTML=s; return !!t.content.textContent.trim(); }

function currentTask(){ return S.noteTask && S.day ? S.day.tasks.find(t=>t.id===S.noteTask) : null; }
function noteKey(){ return S.noteScope==="task" ? "task:"+(S.noteTask||"") : S.noteScope==="day" ? "day:"+S.date : "week:"+S.wk.key; }
function getNote(){ if (S.noteScope==="task"){ const t=currentTask(); return t?t.note:""; } return S.noteScope==="day" ? S.day.dayNote : S.wk.note; }
function setNote(html){
  if (ed.dataset.key!==noteKey()) return;
  if (S.noteScope==="task"){ const t=currentTask(); if (!t) return; const had=hasNote(t.note); t.note=html;
    if (had!==hasNote(html)){ const b=document.querySelector(`[data-id="${t.id}"] .a.note`); if (b) b.classList.toggle("has", !had); }
    changed(700); }
  else if (S.noteScope==="day"){ S.day.dayNote = html; changed(700); }
  else { S.wk.note = html; S.wk.dirty = true; scheduleWeekSave(); }
}

/* week note storage (loaded alongside the day in openDay) */
let wkTimer=null;
function scheduleWeekSave(){ clearTimeout(wkTimer); wkTimer=setTimeout(flushWeek,700); }
function flushWeek(){
  clearTimeout(wkTimer);
  if (!S.wk.dirty || !S.wk.key) return saving;
  S.wk.dirty = false;
  const key = S.wk.key, body = {note:S.wk.note, updatedAt:new Date().toISOString()};
  return queueSave(()=>writeWeek(key, body));
}

/* pane */
function openNote(taskId){ S.noteScope="task"; S.noteTask=taskId; lsSet("dp:scope","task"); setPane(true); setTimeout(()=>{ ed.focus(); caretEnd(); },40); }
function setScope(s){ S.noteScope=s; lsSet("dp:scope",s); hideLinkBar(); renderNotes(); }
function setPane(open){ const was = S.paneOpen && !$("notes").hidden; S.paneOpen = open; lsSet("dp:pane", open?"1":"0"); if (!open) hideLinkBar(); if (open && !was) setSheet(false); renderNotes(); renderHeader(); }

/* phone bottom sheet: half height by default, drag up for full screen, drag down to shrink or close */
const notesEl = $("notes");
S.sheetFull = false;
function setSheet(full){
  S.sheetFull = full; notesEl.classList.toggle("full", full); notesEl.style.height = "";
  $("grab").setAttribute("aria-label", full ? "Shrink notes" : "Expand notes to full screen");
}
let drag = null;
function sheetDown(e){
  if (window.innerWidth > 860 || drag) return;
  if (e.target.closest("button,select,input,a")) return;
  drag = {y:e.clientY, h:notesEl.getBoundingClientRect().height, t:performance.now(), moved:false, el:e.currentTarget};
  notesEl.classList.add("dragging");
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
}
function sheetMove(e){
  if (!drag) return;
  const dy = e.clientY - drag.y; if (Math.abs(dy) > 5) drag.moved = true;
  if (!drag.moved) return;
  e.preventDefault();
  notesEl.style.height = Math.max(90, Math.min(window.innerHeight, drag.h - dy)) + "px";
}
function sheetUp(e){
  if (!drag) return;
  const d = drag; drag = null; notesEl.classList.remove("dragging");
  if (!d.moved){ notesEl.style.height = ""; if (d.el.id==="grab") setSheet(!S.sheetFull); return; }
  const vh = window.innerHeight, h = notesEl.getBoundingClientRect().height;
  const v = (e.clientY - d.y) / Math.max(1, performance.now() - d.t); // px per ms, + is downward
  let target;
  if (v < -0.4) target = "full";
  else if (v > 0.4) target = S.sheetFull && h > vh*0.5 ? "half" : "close";
  else target = h > vh*0.86 ? "full" : h < vh*0.42 ? "close" : "half";
  if (target==="close"){ setSheet(false); setPane(false); }
  else setSheet(target==="full");
}
[$("grab"), $("notesHd")].forEach(el=>{
  el.addEventListener("pointerdown", sheetDown);
  el.addEventListener("pointermove", sheetMove);
  el.addEventListener("pointerup", sheetUp);
  el.addEventListener("pointercancel", sheetUp);
});
$("grab").addEventListener("keydown", e=>{ if (e.key==="Enter" || e.key===" "){ e.preventDefault(); setSheet(!S.sheetFull); } });
function caretEnd(){ try { const r=document.createRange(); r.selectNodeContents(ed); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); } catch(e){} }
function markBlank(){ ed.classList.toggle("blank", !ed.textContent.trim() && !ed.querySelector("li")); }
function renderNotes(){
  const pane = $("notes"), main = $("main");
  pane.hidden = !S.paneOpen || !S.day || S.view==="month"; $("scrim").hidden = pane.hidden;
  main.classList.toggle("split", !pane.hidden);
  if (pane.hidden) return;
  ["task","day","week"].forEach(s=>$("ns-"+s).setAttribute("aria-pressed", S.noteScope===s));
  const sub = $("nsub"); sub.textContent = "";
  let show = true, ph = "";
  if (S.noteScope==="task"){
    if (!currentTask()) S.noteTask = null;
    const named = S.day.tasks.filter(t=>t.text.trim() || t.id===S.noteTask);
    const sel = document.createElement("select"); sel.id="taskSel"; sel.setAttribute("aria-label","Which task");
    sel.append(new Option(named.length ? "Choose a task…" : "No tasks on this page yet", ""));
    named.forEach(t=>{ let l=(hasNote(t.note)?"● ":"")+(t.text.trim()||"Untitled task"); if (l.length>60) l=l.slice(0,59)+"…"; sel.append(new Option(l, t.id)); });
    sel.value = S.noteTask || ""; sel.onchange = ()=>{ S.noteTask = sel.value || null; renderNotes(); if (S.noteTask) setTimeout(()=>{ ed.focus(); caretEnd(); },20); };
    sub.append(sel);
    show = !!S.noteTask; ph = "Notes for this task…";
    $("nempty").textContent = named.length ? "Pick a task above, or tap the note icon beside any task." : "Add a task first, then tap its note icon to write about it.";
  } else if (S.noteScope==="day"){
    sub.textContent = parse(S.date).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
    ph = "Anything for today: calls, numbers, ideas…";
  } else {
    const lo = S.wk.key || weekStart(S.date), hi = addDays(lo,6), f = s=>parse(s).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
    sub.textContent = `Week of ${f(lo)} – ${f(hi)} · stays the same all week`;
    ph = "Goals, follow-ups and reminders for this week…";
  }
  $("tb").hidden = !show; ed.hidden = !show; $("nempty").hidden = show;
  if (!show){ hideLinkBar(); $("openLink").hidden = true; return; }
  const key = noteKey();
  if (document.activeElement!==ed || ed.dataset.key!==key){ ed.innerHTML = toHtml(getNote()); ed.dataset.key = key; }
  ed.dataset.ph = ph; markBlank(); updateTb();
}
["task","day","week"].forEach(s=>{ $("ns-"+s).onclick = ()=>setScope(s); });
$("closeNotes").onclick = ()=>setPane(false);
$("scrim").onclick = ()=>setPane(false);
$("notesBtn").onclick = ()=>{ setPane(!S.paneOpen); if (S.paneOpen && !ed.hidden) setTimeout(()=>ed.focus(),40); };

/* editor */
function serialize(){ return (!ed.textContent.trim() && !ed.querySelector("li")) ? "" : ed.innerHTML; }
function edited(){ markBlank(); setNote(serialize()); updateTb(); }
ed.addEventListener("input", e=>{
  if (e.inputType==="insertParagraph"){ const li=ancestor("LI"); if (li && !li.textContent.trim()) li.removeAttribute("data-done"); }
  edited();
});
ed.addEventListener("paste", e=>{
  const cd = e.clipboardData; if (!cd) return;
  e.preventDefault();
  const html = cd.getData("text/html"), text = cd.getData("text/plain");
  const ins = html ? clean(html) : esc(text).replace(/\r?\n/g,"<br>");
  document.execCommand("insertHTML", false, ins);
});
ed.addEventListener("click", e=>{
  const li = e.target.closest && e.target.closest("ul.chk > li");
  if (li && ed.contains(li) && e.clientX < li.getBoundingClientRect().left + 2){
    e.preventDefault(); li.toggleAttribute("data-done"); edited();
  }
});
ed.addEventListener("keydown", e=>{
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.shiftKey && e.key.toLowerCase()==="k"){ e.preventDefault(); runCmd("link"); }
  else if (mod && e.shiftKey && e.key.toLowerCase()==="l"){ e.preventDefault(); runCmd("check"); }
});

let savedRange = null;
document.addEventListener("selectionchange", ()=>{
  const s = getSelection();
  if (s.rangeCount && ed.contains(s.anchorNode)){ savedRange = s.getRangeAt(0).cloneRange(); updateTb(); }
});
function restoreSel(){ ed.focus(); if (savedRange && ed.contains(savedRange.startContainer)){ const s=getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
function ancestor(tag){ const s=getSelection(); let n = s.rangeCount ? s.anchorNode : null; while (n && n!==ed){ if (n.nodeType===1 && n.tagName===tag) return n; n = n.parentNode; } return null; }
function exec(c,v){ try { return document.execCommand(c, false, v); } catch(e){ return false; } }
function runCmd(c){
  restoreSel();
  if (c==="h"){ exec("formatBlock", ancestor("H3") ? "<div>" : "<h3>"); }
  else if (c==="ul"){ const u=ancestor("UL"); if (u && u.classList.contains("chk")){ u.classList.remove("chk"); u.removeAttribute("class"); } else exec("insertUnorderedList"); }
  else if (c==="check"){ const u=ancestor("UL");
    if (u && u.classList.contains("chk")) exec("insertUnorderedList");
    else if (u) u.className = "chk";
    else { exec("insertUnorderedList"); const n=ancestor("UL"); if (n) n.className = "chk"; } }
  else if (c==="link"){ showLinkBar(); return; }
  else if (c==="clear"){ exec("removeFormat"); if (ancestor("H3")) exec("formatBlock","<div>"); }
  else exec(c);
  edited();
}
const tb = $("tb");
tb.addEventListener("mousedown", e=>{ if (e.target.closest("button")) e.preventDefault(); });
tb.addEventListener("click", e=>{ const b=e.target.closest("button[data-cmd]"); if (b) runCmd(b.dataset.cmd); });
function updateTb(){
  const sel = getSelection(), inside = sel.rangeCount && ed.contains(sel.anchorNode);
  const st = c=>{ try { return document.queryCommandState(c); } catch(e){ return false; } };
  const u = inside ? ancestor("UL") : null;
  tb.querySelectorAll("button[data-cmd]").forEach(b=>{
    const c = b.dataset.cmd; let on = false;
    if (inside){
      if (["bold","italic","underline","strikeThrough","insertOrderedList"].includes(c)) on = st(c);
      else if (c==="ul") on = !!u && !u.classList.contains("chk");
      else if (c==="check") on = !!u && u.classList.contains("chk");
      else if (c==="h") on = !!ancestor("H3");
      else if (c==="link") on = !!ancestor("A");
    }
    if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", on);
  });
  const a = inside ? ancestor("A") : null, ol = $("openLink");
  if (a && a.getAttribute("href")){
    const h = a.getAttribute("href"); const A = $("openLinkA"); A.href = h;
    A.textContent = "Open " + h.replace(/^mailto:/,"").replace(/^https?:\/\//,"").replace(/\/$/,"") + " ↗";
    ol.hidden = false; S.curLink = a;
  } else if (document.activeElement===ed) { ol.hidden = true; S.curLink = null; }
}
function showLinkBar(){
  const a = ancestor("A");
  $("linkIn").value = a ? a.getAttribute("href") : "";
  $("linkbar").hidden = false; $("linkIn").focus();
}
function hideLinkBar(){ $("linkbar").hidden = true; }
function applyLink(){
  let u = $("linkIn").value.trim(); hideLinkBar(); restoreSel();
  if (!u) return;
  if (!/^(https?:|mailto:)/i.test(u)) u = (/^[^\s\/]+@[^\s\/]+\.[^\s\/]+$/.test(u) ? "mailto:" : "https://") + u;
  const a = ancestor("A"), s = getSelection();
  if (a) a.setAttribute("href", u);
  else if (s.isCollapsed) exec("insertHTML", `<a href="${esc(u)}">${esc(u.replace(/^mailto:/,"").replace(/^https?:\/\//,""))}</a>&nbsp;`);
  else exec("createLink", u);
  edited();
}
$("linkAdd").onclick = applyLink;
$("linkCancel").onclick = ()=>{ hideLinkBar(); restoreSel(); };
$("linkIn").onkeydown = e=>{ if (e.key==="Enter"){ e.preventDefault(); applyLink(); } else if (e.key==="Escape"){ e.preventDefault(); hideLinkBar(); restoreSel(); } };
$("unlink").onclick = ()=>{ const a = S.curLink; if (a && ed.contains(a)){ a.replaceWith(...a.childNodes); $("openLink").hidden = true; S.curLink = null; edited(); } };

/* ---------- menu ---------- */
const menu = $("menu");
function openMenu(anchor,t,i){
  menu.textContent = "";
  const item = (label,fn,cls,kbd)=>{ const b=document.createElement("button"); b.setAttribute("role","menuitem"); if(cls) b.className=cls;
    const s=document.createElement("span"); s.textContent=label; b.append(s); if(kbd){const k=document.createElement("kbd"); k.textContent=kbd; b.append(k);}
    b.onclick=()=>{ closeMenu(); fn(); }; menu.append(b); };
  const sep = ()=>{ const d=document.createElement("div"); d.className="sep"; menu.append(d); };
  const setSt = st=>()=>{ t.status = st; if (st!=="cf") t.carried=null; changed(0); renderList(); if (st==="missed") setTimeout(()=>{ const r=$("r-"+t.id); if(r) r.focus(); },20); };
  if (t.status!=="done") item("Done ✓", setSt("done"), "", "⌘↵");
  if (t.status!=="missed") item("Not done ✕", setSt("missed"));
  if (t.status!=="cf") item("Carry forward (cf)", setSt("cf"));
  if (t.status!=="open") item("Back to open", setSt("open"));
  sep();
  if (S.view!=="month") item(hasNote(t.note)?"Open note":"Add a note", ()=>openNote(t.id));
  if (i>0 && isMarked(S.day.tasks[i-1])===isMarked(t)) item("Move up", ()=>{ const a=S.day.tasks; [a[i-1],a[i]]=[a[i],a[i-1]]; changed(0); renderList(); });
  if (i<S.day.tasks.length-1 && isMarked(S.day.tasks[i+1])===isMarked(t)) item("Move down", ()=>{ const a=S.day.tasks; [a[i+1],a[i]]=[a[i],a[i+1]]; changed(0); renderList(); });
  sep();
  item("Delete task", ()=>{ removeTask(t); renderList(); }, "danger");
  menu.hidden = false;
  const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = Math.min(r.right - mw, window.innerWidth - mw - 8); left = Math.max(8,left);
  let top = r.bottom + 4; if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  menu.style.left = left+"px"; menu.style.top = top+"px";
  menu.querySelector("button").focus();
}
function closeMenu(){ menu.hidden = true; }
document.addEventListener("click", e=>{ if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
document.addEventListener("keydown", e=>{ if (e.key==="Escape"){ if(!menu.hidden) closeMenu(); else if (S.paneOpen && window.innerWidth<=860) setPane(false); } });
window.addEventListener("resize", closeMenu); window.addEventListener("scroll", closeMenu, true);

/* ---------- nav ---------- */
$("prev").onclick = ()=> S.view==="month" ? shiftMonth(-1) : openDay(addDays(S.target,-1));
$("next").onclick = ()=> S.view==="month" ? shiftMonth(1) : openDay(addDays(S.target,1));
$("vDay").onclick = ()=>setView("day");
$("vMonth").onclick = ()=>setView("month");
$("openDayBtn").onclick = ()=>{ setView("day"); window.scrollTo({top:0}); };
$("today").onclick = ()=>openDay(todayISO());
$("pick").onchange = e=>{ if (e.target.value) openDay(e.target.value); };

function setFoot(msg){
  $("foot").textContent = msg || "Saved on this device only.";
}

/* ---------- account ---------- */
S.user = null;
function renderAccount(){
  const a = $("acct"); a.textContent = "";
  const button = (label, run)=>{ const b = document.createElement("button"); b.textContent = label;
    b.onclick = async ()=>{ b.disabled = true; try { await run(); } catch(e){ setFoot(navigator.onLine ? "Something went wrong ("+errMsg(e)+"). Please try again." : "You're offline. Try again when you're back online."); } b.disabled = false; };
    return b; };
  if (S.user){
    const who = document.createElement("span"); who.textContent = "Signed in as "+(S.user.email || S.user.name);
    a.append(who, button("Sign out", async ()=>{ await signOut(); S.user = null; renderAccount(); }));
  } else {
    a.append(button("Sign in", async ()=>{ await Promise.all([flush(), flushWeek()]); location.href = "/signin"; }));
  }
  const p = document.createElement("a"); p.href = "/privacy"; p.textContent = "Privacy"; a.append(p);
}

/* ---------- new version ---------- */
function offerUpdate(apply){
  const t = $("toast"); t.textContent = "";
  const msg = document.createElement("span"); msg.textContent = "A new version of MyDay is ready";
  const b = document.createElement("button"); b.className = "btn pen"; b.textContent = "Refresh";
  b.onclick = async ()=>{ b.disabled = true; await Promise.all([flush(), flushWeek()]); apply(); };
  t.append(msg, b); t.hidden = false;
}

/* ---------- boot ---------- */
async function boot(){
  registerSW(offerUpdate);
  renderHeader(); renderWeek();
  try { await initStore(); }
  catch(e){
    $("listWrap").textContent = "";
    const l = document.createElement("div"); l.className = "loading";
    l.textContent = "Couldn't open storage on this device ("+errMsg(e)+"). If this is a private window, try a normal one.";
    $("listWrap").append(l); return;
  }
  // ask the browser not to clear our data under storage pressure
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  S.mode = "local";
  setFoot();
  currentUser().then(u=>{ S.user = u; renderAccount(); });
  // roll to a new day if the page stays open past midnight
  let lastToday = todayISO();
  setInterval(()=>{ const t = todayISO(); if (t!==lastToday){ const wasToday = S.date===lastToday; lastToday=t; if (wasToday && !isEditing()) openDay(t); else renderWeek(); } }, 60000);
  openDay(S.date);
}
boot();
})();
