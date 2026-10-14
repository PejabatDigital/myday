/* Who is making this request. Returns a user id, or null when signed out.

   Until sign-in lands (build step 6, Better Auth) nobody is signed in on a deployed site,
   so the API answers 401 to everything there. For local development only, DEV_USER_ID
   (set in the git-ignored .dev.vars) signs every localhost request in as that user. */
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

export async function getUserId(request, env){
  if (env.DEV_USER_ID && LOCAL.has(new URL(request.url).hostname)) return String(env.DEV_USER_ID);
  return null;
}
