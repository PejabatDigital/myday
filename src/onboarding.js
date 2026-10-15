/* Onboarding (Figma "Onboarding", page 49:2): Welcome, Intro 1–3, the Add to Home Screen
   tip and the signed-out screen. They cover the app; app.js decides when each one shows.

   - Welcome: opening MyDay signed out, unless "Use without an account" was chosen here.
   - Intro 1–3 (can skip): after creating an account, or choosing to use it without one.
   - Tip: after the intro, or after signing in; only if MyDay isn't on the home screen yet,
     and only once per device.
   - Signed out: straight after signing out (tasks stay on this device). */
const NO_ACCOUNT = "dp:noaccount", TIP = "dp:tip";
const ls = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(e){} },
};
const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

export const choseNoAccount = () => !!ls.get(NO_ACCOUNT);
export const chooseNoAccount = () => ls.set(NO_ACCOUNT, new Date().toISOString());

const root = () => document.getElementById("onboard");
let showing = null;
export const isShowing = name => showing===name;

function show(name, cls, html){
  const r = root();
  showing = name;
  r.className = "onb "+cls; r.innerHTML = html; r.hidden = false; r.scrollTop = 0;
  document.documentElement.classList.add("onb-open");
  const first = r.querySelector("[data-focus]"); if (first) first.focus({preventScroll:true});
}
export function close(){
  const r = root(); showing = null;
  r.hidden = true; r.textContent = ""; r.className = "onb";
  document.documentElement.classList.remove("onb-open");
}

/* the navy screens: Welcome and Signed out */
const MOTIF = '<div class="motif" aria-hidden="true">'+"<i></i>".repeat(4)+'<i class="b"></i>'.repeat(3)+"</div>";
function navy(name, title, text, actions){
  show(name, "navy", `<div class="in">
    <div class="top"><img class="appicon" src="/icons/icon.svg" alt="" width="88" height="88">
      <h2>${title}</h2><p>${text}</p></div>
    ${MOTIF}
    <p class="msg" id="onbMsg" role="status" aria-live="polite" hidden></p>
    <div class="oacts">${actions}</div></div>`);
}
function goSignIn(){
  if (!navigator.onLine){ const m = document.getElementById("onbMsg"); m.textContent = "You're offline. Connect to sign in, or use without an account."; m.hidden = false; return; }
  location.href = "/signin";
}

export function welcome(onNoAccount){
  navy("welcome", "Welcome to MyDay", "A calm daily list for your tasks and notes. Carry forward what's left, and pick up on any device.",
    `<button class="btn white" id="onbEmail" data-focus>Continue with email</button>
     <button class="btn ghost" id="onbLocal">Use without an account</button>
     <p class="fine">New here? You can create an account on the next screen. By continuing you agree to the <a href="/privacy">privacy policy</a>.</p>`);
  document.getElementById("onbEmail").onclick = goSignIn;
  document.getElementById("onbLocal").onclick = ()=>{ chooseNoAccount(); onNoAccount(); };
}

export function signedOut(onNoAccount){
  navy("signedout", "You're signed out", "Your tasks are safe in your account, and they're still on this device.",
    `<button class="btn white" id="onbEmail" data-focus>Continue with email</button>
     <button class="btn ghost" id="onbLocal">Use without an account</button>
     <p class="fine">Signed in on another device? You'll stay signed in there.</p>`);
  document.getElementById("onbEmail").onclick = goSignIn;
  document.getElementById("onbLocal").onclick = ()=>{ chooseNoAccount(); onNoAccount(); };
}

/* Intro 1–3 */
const st = cls => `<span class="st ${cls}"></span>`;
const row = (cls, text) => `<div class="r ${cls}">${st(cls)}<span class="t">${esc(text)}</span></div>`;
const CARDS = [
  { title:"Plan today", text:"Add what you want to get done. Tap the circle when it's done.",
    stage:`<div class="lab">Today</div>${row("done","Reply to June")}${row("","Book the car service")}${row("","Call the contractor")}
      <div class="adder typing"><span class="t">Pick up groceries</span><span class="plus"><i class="ic ic-send"></i></span></div>` },
  { title:"See how the day is going", text:"The line under the date fills in as you go: blue for done, red for missed.",
    stage:`<div class="big">Thursday</div><div class="dl"><i class="done"></i><i class="done"></i><i class="done"></i><i class="done"></i><i class="missed"></i><i class="cf"></i><i class="cf"></i></div>
      <div class="dls">4 of 7 done. 1 missed, 2 carried.</div>`, cls:"wide" },
  { title:"Nothing gets lost", text:"Anything you don't finish waits for you tomorrow. Add it to the new day in one tap.",
    stage:`<div class="sh"><span>Carried from yesterday</span><span class="q">Add all</span></div>
      <div class="srow">${st("sugg")}<span class="t">Call the contractor</span></div><div class="srow">${st("sugg")}<span class="t">Send the quotation</span></div>` },
];
export function intro(onDone){
  let i = 0;
  const render = ()=>{
    const c = CARDS[i], last = i===CARDS.length-1;
    show("intro", "light", `<div class="in">
      <div class="skip">${last ? "" : '<button class="btn quiet" id="onbSkip">Skip</button>'}</div>
      <div class="grow"></div>
      <div class="stage ${c.cls||""}" aria-hidden="true">${c.stage}</div>
      <div class="grow"></div>
      <div class="text"><h2>${c.title}</h2><p>${c.text}</p></div>
      <div class="bottom"><div class="dots" aria-label="Card ${i+1} of ${CARDS.length}">${CARDS.map((_,k)=>`<i${k===i?' class="on"':""}></i>`).join("")}</div>
        <button class="btn primary big" id="onbNext" data-focus>${last ? "Start my day" : "Next"}</button></div></div>`);
    document.getElementById("onbNext").onclick = ()=>{ if (last) onDone(); else { i++; render(); } };
    const skip = document.getElementById("onbSkip"); if (skip) skip.onclick = onDone;
  };
  render();
}

/* Add to Home Screen tip — the steps depend on the device and browser */
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone===true;
function tipFor(){
  const ua = navigator.userAgent;
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (/iPhone|iPod/.test(ua) || iPad) return {
    title:"Add MyDay to your Home Screen", text:"It opens full screen like any other app, and works without internet.",
    steps:[["share","Tap Share", iPad ? "The square with an arrow, at the top of Safari" : "The square with an arrow, at the bottom of Safari"],
      ["add-square","Choose Add to Home Screen","Scroll down the menu if you don't see it"],
      ["tick","Tap Add","MyDay appears on your Home Screen"]] };
  if (/Android/.test(ua)) return {
    title:"Add MyDay to your Home Screen", text:"It opens full screen like any other app, and works without internet.",
    steps:[["share","Open the browser menu","The three dots at the top right"],
      ["add-square","Choose Install app","Some browsers call it Add to Home screen"],
      ["tick","Tap Install","MyDay appears on your Home Screen"]] };
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return {
    title:"Add MyDay to your Dock", text:"It opens in its own window like any other app, and works without internet.",
    steps:[["share","Choose File, then Add to Dock","In the Safari menu bar at the top of the screen"],
      ["tick","Click Add","MyDay appears in your Dock"]] };
  if (/Chrome|Chromium|Edg/.test(ua)) return {
    title:"Install MyDay on this computer", text:"It opens in its own window like any other app, and works without internet.",
    steps:[["add-square","Click the install icon in the address bar","At the right-hand end, next to the star"],
      ["tick","Click Install","MyDay opens in its own window"]] };
  return null; // browsers that can't install web apps
}
export const needsTip = () => !installed() && !ls.get(TIP) && !!tipFor();

export function tip(onDone){
  const t = tipFor();
  show("tip", "light", `<div class="in">
    <img class="appicon sm" src="/icons/icon.svg" alt="" width="72" height="72">
    <div class="text"><h2>${t.title}</h2><p>${t.text}</p></div>
    <ol class="steps">${t.steps.map(([ic,a,b])=>`<li><span class="si"><i class="ic ic-${ic}"></i></span><span><b>${a}</b><small>${b}</small></span></li>`).join("")}</ol>
    <div class="grow"></div>
    <div class="oacts"><button class="btn primary big" id="onbDone" data-focus>Done</button><button class="btn quiet" id="onbLater">Not now</button></div></div>`);
  const done = ()=>{ ls.set(TIP, new Date().toISOString()); onDone(); };
  document.getElementById("onbDone").onclick = done;
  document.getElementById("onbLater").onclick = done;
}

/* Intro, then the tip if it's needed, then onDone */
export function firstRun(onDone){ intro(()=> needsTip() ? tip(onDone) : onDone()); }
