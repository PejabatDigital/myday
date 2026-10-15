/* Account emails (confirm email, reset password), sent through Resend from
   no-reply@kasahkod.cc. Needs the secret RESEND_API_KEY. */
const FROM = "MyDay <no-reply@kasahkod.cc>";

export async function sendEmail(env, to, subject, text){
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "authorization": "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + await r.text());
}
