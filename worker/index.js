/* MyDay Worker: /api/* goes to the API; everything else is the built app in dist/
   (wrangler.jsonc routes only /api/* through this code, assets are served directly). */
import { handleApi } from "./api.js";

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (url.pathname==="/api" || url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};
