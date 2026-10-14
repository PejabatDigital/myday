/* Who's signed in, via the Worker's /api/auth routes (Better Auth).
   The last known user is remembered on this device so the app knows it offline. */
const KEY = "dp:user";

function remember(user){
  try { if (user) localStorage.setItem(KEY, JSON.stringify(user)); else localStorage.removeItem(KEY); } catch(e){}
}
function remembered(){
  try { return JSON.parse(localStorage.getItem(KEY)); } catch(e){ return null; }
}

/* The signed-in user {id, email, name}, or null. Asking the server also renews the session. */
export async function currentUser(){
  try {
    const r = await fetch("/api/auth/get-session", {headers:{accept:"application/json"}});
    if (!r.ok) throw new Error("HTTP "+r.status);
    const d = await r.json();
    const user = d && d.user ? {id:d.user.id, email:d.user.email, name:d.user.name} : null;
    remember(user);
    return user;
  } catch(e){
    return remembered(); // offline: assume nothing changed
  }
}

/* Goes to Google; Google sends the person back to the app once they've signed in. */
export async function signIn(){
  const r = await fetch("/api/auth/sign-in/social", {method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({provider:"google", callbackURL:"/"})});
  const d = await r.json().catch(()=>({}));
  if (!r.ok || !d.url) throw new Error(d.message || "HTTP "+r.status);
  location.href = d.url;
}

export async function signOut(){
  const r = await fetch("/api/auth/sign-out", {method:"POST", headers:{"content-type":"application/json"}, body:"{}"});
  if (!r.ok) throw new Error("HTTP "+r.status);
  remember(null);
}
