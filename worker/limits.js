/* Sign-in rules, and the per-email limit on sending codes (as Quran Daily).

   The per-email limit sits on top of Better Auth's per-address limits, so one inbox can't
   be flooded from many networks. Kept in D1 (Worker memory isn't shared between requests),
   keyed by a SHA-256 of the email, never the email itself. public/signin.html repeats
   CODE_MINUTES and RESEND_WAIT_SECONDS in its words and countdown. */

export const CODE_MINUTES = 10;         // how long an emailed code works
export const WRONG_GUESSES = 5;         // wrong tries per code; after that a new code is needed
export const RESEND_WAIT_SECONDS = 60;  // wait between codes sent to one email
export const CODES_PER_HOUR = 5;        // codes one email can be sent in an hour

const HOUR = 60 * 60 * 1000;

async function hashEmail(email){
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* Records a send for `email` and returns 0, or, when it's too soon, the seconds to wait
   (nothing recorded). */
export async function takeCodeSend(db, email, now = Date.now()){
  const hash = await hashEmail(email);
  const [, recent] = await db.batch([
    db.prepare("DELETE FROM email_sends WHERE sent_at <= ?1").bind(now - HOUR),
    db.prepare("SELECT sent_at FROM email_sends WHERE email_hash = ?1 ORDER BY sent_at").bind(hash),
  ]);
  const times = recent.results.map(r=>r.sent_at);
  const wait = Math.max(
    times.length ? times[times.length-1] + RESEND_WAIT_SECONDS*1000 - now : 0,
    times.length >= CODES_PER_HOUR ? times[times.length-CODES_PER_HOUR] + HOUR - now : 0,
  );
  if (wait > 0) return Math.ceil(wait / 1000);
  await db.prepare("INSERT INTO email_sends (email_hash, sent_at) VALUES (?1, ?2)").bind(hash, now).run();
  return 0;
}
