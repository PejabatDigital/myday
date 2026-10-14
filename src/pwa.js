/* Registers the service worker (production builds only) and calls onUpdate(apply) when a
   new version is waiting. apply() hands over to it; the page reloads once it has. */
export function registerSW(onUpdate){
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  let wanted = false, reloading = false;
  // the very first install also takes control; only reload when the person asked for the new version
  sw.addEventListener("controllerchange", ()=>{ if (wanted && !reloading){ reloading = true; location.reload(); } });

  const start = async ()=>{
    let reg;
    try { reg = await sw.register("/sw.js"); } catch(e){ return; }
    const offer = w => onUpdate(()=>{ wanted = true; w.postMessage({type:"SKIP_WAITING"}); });
    if (reg.waiting && sw.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", ()=>{
      const w = reg.installing; if (!w) return;
      w.addEventListener("statechange", ()=>{ if (w.state==="installed" && sw.controller) offer(w); });
    });
    // an installed app can stay open for days, so check for a new version whenever it comes back
    document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState==="visible") reg.update().catch(()=>{}); });
  };
  if (document.readyState==="complete") start(); else window.addEventListener("load", start);
}
