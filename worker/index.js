/* MyDay Worker: /api/auth/* is sign-in, the rest of /api/* is the API; everything else is
   the built app in dist/ (wrangler.jsonc routes only /api/* through this code). */
import { handleApi } from "./api.js";
import { getAuth } from "./auth.js";

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/")) return getAuth(env).handler(request);
    if (url.pathname==="/api" || url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
