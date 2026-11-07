/* Sign-in with a 6-digit email code (Better Auth's email OTP plugin), stored in D1, as
   Quran Daily. No passwords. The routes the app uses live under /api/auth/* (see
   AUTH_ROUTES in index.js): POST email-otp/send-verification-otp, sign-in/email-otp,
   sign-out; GET get-session. Signing in with a new email creates the account.

   Settings (wrangler.jsonc "vars", secrets via `wrangler secret put`, or .dev.vars locally):
   BETTER_AUTH_URL, and the secrets BETTER_AUTH_SECRET, RESEND_API_KEY. */
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { sendCodeEmail } from "./email.js";
import { CODE_MINUTES, WRONG_GUESSES } from "./limits.js";

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
      plugins: [
        emailOTP({
          otpLength: 6,
          expiresIn: CODE_MINUTES * 60,
          allowedAttempts: WRONG_GUESSES,
          storeOTP: "hashed",
          sendVerificationOTP: ({email, otp}) => sendCodeEmail(env, email, otp),
        }),
      ],
      // stay signed in for 60 days, renewed (at most daily) whenever the app is opened
      session: { expiresIn: 60 * DAY, updateAge: DAY },
      // Limits per internet address, kept in D1 since Worker memory isn't shared between
      // requests. Better Auth only switches them on by itself when it detects production,
      // which it can't on Workers, so they're switched on here. The email plugin adds 3 a
      // minute for sending codes; signing in gets a little more room for mistyped codes.
      rateLimit: {
        enabled: true,
        storage: "database",
        customRules: { "/sign-in/email-otp": { window: 60, max: 10 } },
      },
      advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
      // sessions don't keep the internet address or browser details
      databaseHooks: {
        session: { create: { before: async session => ({ data: { ...session, ipAddress: null, userAgent: null } }) } },
      },
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
