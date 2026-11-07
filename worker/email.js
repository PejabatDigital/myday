/* Sign-in code emails, sent through Resend from no-reply@kasahkod.cc with replies going
   to hello@kasahkod.cc. Needs the secret RESEND_API_KEY. Locally, EMAIL_TO_CONSOLE=true
   (in .dev.vars) prints the code in the terminal instead. */
import { CODE_MINUTES } from "./limits.js";

const FROM = "MyDay <no-reply@kasahkod.cc>";
const REPLY_TO = "hello@kasahkod.cc";

export async function sendCodeEmail(env, to, code){
  const subject = `Your MyDay code is ${code}`;
  const text = `Your MyDay sign-in code is:\n\n${code}\n\n` +
    `It works for ${CODE_MINUTES} minutes.\n\n` +
    "If this wasn't you, ignore this email. No one can sign in without this code.";
  if (env.EMAIL_TO_CONSOLE==="true"){ console.log(`Sign-in code for ${to}: ${code}`); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "authorization": "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + await r.text());
}
