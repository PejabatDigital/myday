/* MyDay API, served under /api.

   GET  /api/health              is the database reachable (no sign-in needed)
   PUT  /api/days/:date          store a day document
   PUT  /api/weeks/:weekStart    store a week note ({note, updatedAt}); weekStart is a Monday
   GET  /api/changes?since=N     docs changed after change number N, oldest first
   DELETE /api/account           delete the signed-in person: their days, weeks and account

   A PUT whose updatedAt is older than what the server holds is refused with 409 and the
   server's copy, so the device can keep both and show the conflict notice. */
import { getUserId } from "./auth.js";
import { BODY_MAX, changesQuery, dayDoc, isDate, isMonday, weekDoc } from "./schema.js";
import { changes, deleteAccount, putDay, putWeek } from "./store.js";

const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {"content-type":"application/json; charset=utf-8", "cache-control":"no-store"},
});
const fail = (status, error, extra) => json({error, ...extra}, status);

class HttpError extends Error {
  constructor(status, message, extra){ super(message); this.status = status; this.extra = extra; }
}

/* Reads and validates a JSON body against a zod schema. */
async function readBody(request, schema){
  const text = await request.text();
  if (new TextEncoder().encode(text).length > BODY_MAX) throw new HttpError(413, "Body is too large");
  let data;
  try { data = JSON.parse(text); } catch(e){ throw new HttpError(400, "Body must be JSON"); }
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "Invalid body", {issues: r.error.issues.map(i=>({path:i.path.join("."), message:i.message}))});
  return r.data;
}

const routes = [
  {method:"GET", path:/^\/api\/health$/, auth:false, async run({env}){
    await env.DB.prepare("SELECT 1").first();
    return json({ok:true});
  }},
  {method:"PUT", path:/^\/api\/days\/([^/]+)$/, async run({request, env, user, params:[date]}){
    if (!isDate(date)) throw new HttpError(400, "Not a date");
    const doc = await readBody(request, dayDoc);
    if (doc.date!==date) throw new HttpError(400, "Body date doesn't match the URL");
    const r = await putDay(env.DB, user, doc);
    return r.ok ? json({ok:true, version:r.version}) : fail(409, "conflict", {version:r.version, server:r.server});
  }},
  {method:"PUT", path:/^\/api\/weeks\/([^/]+)$/, async run({request, env, user, params:[weekStart]}){
    if (!isMonday(weekStart)) throw new HttpError(400, "Week start must be a Monday");
    const doc = await readBody(request, weekDoc);
    const r = await putWeek(env.DB, user, weekStart, doc);
    return r.ok ? json({ok:true, version:r.version}) : fail(409, "conflict", {version:r.version, server:r.server});
  }},
  {method:"DELETE", path:/^\/api\/account$/, async run({env, user}){
    await deleteAccount(env.DB, user); // the session goes too, so the browser's cookie stops working
    return json({ok:true});
  }},
  {method:"GET", path:/^\/api\/changes$/, async run({url, env, user}){
    const q = changesQuery.safeParse(Object.fromEntries(url.searchParams));
    if (!q.success) throw new HttpError(400, "since and limit must be whole numbers (limit up to 500)");
    return json(await changes(env.DB, user, q.data.since, q.data.limit));
  }},
];

export async function handleApi(request, env){
  const url = new URL(request.url);
  const matches = routes.map(r=>({r, m:r.path.exec(url.pathname)})).filter(x=>x.m);
  if (!matches.length) return fail(404, "Not found");
  const hit = matches.find(x=>x.r.method===request.method);
  if (!hit) return new Response(JSON.stringify({error:"Method not allowed"}), {status:405,
    headers:{"content-type":"application/json; charset=utf-8", "allow":matches.map(x=>x.r.method).join(", ")}});
  try {
    let user = null;
    if (hit.r.auth!==false){
      user = await getUserId(request, env);
      if (!user) return fail(401, "Sign in required");
    }
    return await hit.r.run({request, env, url, user, params:hit.m.slice(1).map(decodeURIComponent)});
  } catch(e){
    if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
    if (e instanceof URIError) return fail(400, "Bad URL");
    console.error(e);
    return fail(500, "Something went wrong");
  }
}
