/* Sign-in with email and password (Better Auth), stored in D1. Its routes live under
   /api/auth/*: POST sign-up/email, sign-in/email, sign-out, request-password-reset,
   reset-password; GET get-session, verify-email, reset-password/:token.

   Settings (wrangler.jsonc "vars", secrets via `wrangler secret put`, or .dev.vars locally):
   BETTER_AUTH_URL, and the secrets BETTER_AUTH_SECRET, RESEND_API_KEY. */
import { betterAuth } from "better-auth";
import { sendEmail } from "./email.js";

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
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        password: { hash: hashPassword, verify: verifyPassword },
        sendResetPassword: ({user, url}) => sendEmail(env, user.email, "Reset your MyDay password",
          "Someone asked to reset the password for your MyDay account.\n\n" +
          "To choose a new password, open this link (it works for one hour):\n" + url + "\n\n" +
          "If it wasn't you, ignore this email. Your password stays the same."),
      },
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true, // signing in before confirming sends a fresh link
        autoSignInAfterVerification: true,
        sendVerificationEmail: ({user, url}) => sendEmail(env, user.email, "Confirm your email for MyDay",
          "Welcome to MyDay.\n\n" +
          "To finish creating your account, open this link (it works for one hour):\n" + url + "\n\n" +
          "If you didn't sign up for MyDay, ignore this email."),
      },
      // stay signed in for 60 days, renewed (at most daily) whenever the app is opened
      session: { expiresIn: 60 * DAY, updateAge: DAY },
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

/* Passwords are stored scrambled with PBKDF2-SHA256, which Workers run natively. The free
   Workers plan allows 10 ms of CPU per request, so the round count is kept low enough to fit;
   it's stored with each password, so it can be raised later without breaking old ones. */
const ROUNDS = 5000;
const hex = bytes => [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
const unhex = s => new Uint8Array(s.match(/../g).map(h=>parseInt(h,16)));

async function pbkdf2(password, salt, rounds){
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations:rounds}, key, 256));
}

async function hashPassword(password){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ROUNDS}$${hex(salt)}$${hex(await pbkdf2(password, salt, ROUNDS))}`;
}

async function verifyPassword({hash, password}){
  const [scheme, rounds, salt, expected] = hash.split("$");
  if (scheme!=="pbkdf2-sha256" || !expected) return false;
  const actual = await pbkdf2(password, unhex(salt), Number(rounds)), want = unhex(expected);
  let diff = actual.length ^ want.length; // compare in constant time
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ want[i];
  return diff===0;
}
