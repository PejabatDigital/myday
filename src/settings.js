/* Settings: its own page at /settings with a Back button. Opened from the gear in the header
   (phone, iPad) or "Settings" at the bottom of the Mac sidebar.

   Account (email, change password by emailed link, sign out, delete my account — typed
   DELETE to confirm), Appearance (System / Light / Dark, remembered on this device), and
   About (version, privacy, contact). app.js supplies the account actions as hooks. */
export const VERSION = "2.0";
const THEME = "dp:theme";

const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const $ = id => document.getElementById(id);

/* Appearance, per device. index.html applies the saved choice before the page draws. */
export function theme(){ try { return localStorage.getItem(THEME) || "system"; } catch(e){ return "system"; } }
export function setTheme(t){
  try { if (t==="system") localStorage.removeItem(THEME); else localStorage.setItem(THEME, t); } catch(e){}
  const root = document.documentElement;
  if (t==="system") delete root.dataset.theme; else root.dataset.theme = t;
  // the browser bar follows too
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{
    if (!m.dataset.color) m.dataset.color = m.content;
    m.content = t==="light" ? "#F6F7F9" : t==="dark" ? "#0B1020" : m.dataset.color;
  });
}

/* hooks: user() → {email} or null; signIn(); signOut(); sendReset(email); deleteAccount() */
let hooks = null, view = "main";
export function init(h){
  hooks = h;
  window.addEventListener("popstate", ()=>{ if (location.pathname==="/settings") show(); else hide(); });
  if (location.pathname==="/settings") show();
}

export const isOpen = () => !$("settings").hidden;
export function open(){
  if (location.pathname!=="/settings") history.pushState({settings:true}, "", "/settings");
  show();
}
function back(){
  if (view!=="main"){ view = "main"; render(); return; }
  if (history.state && history.state.settings) history.back(); // also closes on the popstate
  else { history.replaceState(null, "", "/"); hide(); }
}
export function close(){
  if (location.pathname==="/settings") history.replaceState(null, "", "/");
  hide();
}
function show(){ view = "main"; render(); const el = $("settings"); el.hidden = false; el.scrollTop = 0; document.documentElement.classList.add("set-open"); $("setBack").focus({preventScroll:true}); }
function hide(){ const el = $("settings"); el.hidden = true; el.textContent = ""; document.documentElement.classList.remove("set-open"); }
export function refresh(){ if (isOpen()) render(); }

function say(text, bad){ const m = $("setMsg"); if (!m) return; m.textContent = text; m.className = "smsg"+(bad?" bad":""); m.hidden = !text; }
const offline = () => !navigator.onLine;

function render(){
  const el = $("settings"), u = hooks.user();
  if (view==="delete"){ renderDelete(el, u); return; }
  const t = theme();
  el.innerHTML = `<div class="in">
    <div class="sbar"><button class="btn quiet back" id="setBack"><i class="ic ic-left"></i>Back</button></div>
    <h1 class="stitle">Settings</h1>

    <h2 class="sgh">Account</h2>
    ${u ? `<div class="card">
        <div class="srow"><span>Email</span><span class="v">${esc(u.email || "")}</span></div>
        <button class="srow act" id="setPw">Change password</button>
        <button class="srow act" id="setOut">Sign out</button>
      </div>
      <p class="smsg" id="setMsg" role="status" aria-live="polite" hidden></p>
      <div class="card"><button class="srow del" id="setDel">Delete my account</button></div>`
    : `<div class="card pad"><p>Sign in to keep your tasks on your phone, iPad and Mac.</p>
        <button class="btn primary wide" id="setIn">Continue with email</button></div>`}

    <h2 class="sgh">Appearance</h2>
    <div class="seg wide" role="group" aria-label="Appearance">
      ${["system","light","dark"].map(k=>`<button data-theme-opt="${k}" aria-pressed="${t===k}">${k[0].toUpperCase()+k.slice(1)}</button>`).join("")}
    </div>

    <h2 class="sgh">About</h2>
    <div class="card">
      <div class="srow"><span>Version</span><span class="v">${VERSION}</span></div>
      <a class="srow act" href="/privacy">Privacy<i class="ic ic-right"></i></a>
      <a class="srow" href="mailto:hello@kasahkod.cc"><span>Contact</span><span class="v link">hello@kasahkod.cc</span></a>
    </div>

    <p class="kk">{ kasah kod }</p>
  </div>`;
  $("setBack").onclick = back;
  el.querySelectorAll("[data-theme-opt]").forEach(b=>b.onclick = ()=>{ setTheme(b.dataset.themeOpt); render(); });
  if (!u){ $("setIn").onclick = hooks.signIn; return; }
  $("setPw").onclick = async ()=>{
    if (offline()) return say("You're offline. Connect to change your password.", true);
    $("setPw").disabled = true;
    try { await hooks.sendReset(u.email); say(`We've sent a link to ${u.email}. Open it to choose a new password.`); }
    catch(e){ say("Couldn't send the email. Please try again.", true); }
    $("setPw").disabled = false;
  };
  $("setOut").onclick = async ()=>{
    if (offline()) return say("You're offline. Connect to sign out, so nothing is left unsynced.", true);
    $("setOut").disabled = true;
    try { await hooks.signOut(); } catch(e){ say("Couldn't sign out. Please try again.", true); $("setOut").disabled = false; }
  };
  $("setDel").onclick = ()=>{ view = "delete"; render(); };
}

function renderDelete(el, u){
  el.innerHTML = `<div class="in">
    <div class="sbar"><button class="btn quiet back" id="setBack"><i class="ic ic-left"></i>Settings</button></div>
    <h1 class="stitle">Delete my account</h1>
    <div class="card pad">
      <p>This deletes your account and everything stored online: all your tasks, notes and week notes. It also clears this device.</p>
      <p>Your other devices keep what's on them until you open MyDay there. This can't be undone.</p>
      <label class="field">Type DELETE to confirm
        <input id="delIn" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE"></label>
      <button class="btn danger wide" id="delGo" disabled>Delete my account</button>
      <p class="smsg" id="setMsg" role="status" aria-live="polite" hidden></p>
    </div>
  </div>`;
  $("setBack").onclick = back;
  const inp = $("delIn"), go = $("delGo");
  inp.oninput = ()=>{ go.disabled = inp.value.trim()!=="DELETE"; };
  go.onclick = async ()=>{
    if (offline()) return say("You're offline. Connect to delete your account.", true);
    go.disabled = true; inp.disabled = true; say("Deleting…");
    try { await hooks.deleteAccount(); } // reloads the app when it's done
    catch(e){ say(e.message || "Couldn't delete your account. Please try again.", true); go.disabled = false; inp.disabled = false; }
  };
  inp.focus();
}
