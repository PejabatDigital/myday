/* Sign-in with Google (Better Auth), stored in D1. Its routes live under /api/auth/*:
   POST /api/auth/sign-in/social, GET /api/auth/callback/google, GET /api/auth/get-session,
   POST /api/auth/sign-out.

   Settings (wrangler.jsonc "vars", secrets via `wrangler secret put`, or .dev.vars locally):
   BETTER_AUTH_URL, GOOGLE_CLIENT_ID, and the secrets BETTER_AUTH_SECRET, GOOGLE_CLIENT_SECRET. */
import { betterAuth } from "better-auth";

const DAY = 60 * 60 * 24;
const instances = new WeakMap(); // one Better Auth instance per Worker environment

export function getAuth(env){
  let auth = instances.get(env);
  if (!auth){
    auth = betterAuth({
      appName: "MyDay",
      baseURL: env.BETTER_AUTH_URL,
      basePath: "/api/auth",
      secret: env.BETTER_AUTH_SECRET,
      database: env.DB,
      // Google's default scopes only: name, email address and profile picture
      socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } },
      // stay signed in for 60 days, renewed (at most daily) whenever the app is opened
      session: { expiresIn: 60 * DAY, updateAge: DAY },
      account: { encryptOAuthTokens: true },
      telemetry: { enabled: false },
    });
    instances.set(env, auth);
  }
  return auth;
}

/* The signed-in user's id, or null when signed out. */
export async function getUserId(request, env){
  const session = await getAuth(env).api.getSession({ headers: request.headers });
  return session ? session.user.id : null;
}
