/* MyDay Worker: /api/auth/* is sign-in, the rest of /api/* is the API; everything else is
   the built app in dist/ (wrangler.jsonc routes only /api/* through this code). */
import { handleApi } from "./api.js";
import { getAuth } from "./auth.js";
import { takeCodeSend } from "./limits.js";

const json = (data, status, headers) => new Response(JSON.stringify(data), {
  status, headers: {"content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...headers},
});

/* The only sign-in routes the app uses; Better Auth's others stay switched off. */
const AUTH_ROUTES = {
  "/api/auth/email-otp/send-verification-otp": "POST",
  "/api/auth/sign-in/email-otp": "POST",
  "/api/auth/sign-out": "POST",
  "/api/auth/get-session": "GET",
};

async function handleAuth(request, env){
  const path = new URL(request.url).pathname;
  if (AUTH_ROUTES[path]!==request.method) return json({error:"Not found"}, 404);
  if (path==="/api/auth/email-otp/send-verification-otp"){
    let body;
    try { body = await request.clone().json(); } catch(e){ return json({error:"Body must be JSON"}, 400); }
    if (body?.type!=="sign-in" || typeof body.email!=="string") return json({error:"Invalid request"}, 400);
    const wait = await takeCodeSend(env.DB, body.email);
    if (wait) return json({code:"TOO_SOON", message:"Please wait before asking for another code"}, 429, {"retry-after":String(wait)});
  }
  return getAuth(env).handler(request);
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/")) return handleAuth(request, env);
    if (url.pathname==="/api" || url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
