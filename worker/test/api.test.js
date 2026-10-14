import { beforeEach, describe, expect, it } from "vitest";
import worker from "../index.js";
import { testD1 } from "./d1.js";

let DB;
beforeEach(()=>{ DB = testD1(); });

const call = (method, path, {body, user="amin", host="localhost"}={}) => worker.fetch(
  new Request(`http://${host}${path}`, {method, body: body===undefined ? undefined : typeof body==="string" ? body : JSON.stringify(body)}),
  {DB, DEV_USER_ID:user, ASSETS:{fetch:()=>new Response("app")}});
const send = async (...a) => { const r = await call(...a); return {status:r.status, body:await r.json()}; };

const day = (date, text, updatedAt="2026-10-14T09:00:00.000Z") =>
  ({date, dayNote:"", updatedAt, tasks:[{id:"t1", text, status:"open", reason:"", note:"", from:null, carried:null}]});

describe("routing and sign-in", ()=>{
  it("serves the app for anything outside /api", async ()=>{
    expect(await (await call("GET", "/")).text()).toBe("app");
  });
  it("answers health without sign-in", async ()=>{
    expect(await send("GET", "/api/health", {user:null})).toEqual({status:200, body:{ok:true}});
  });
  it("refuses data requests when signed out", async ()=>{
    expect((await send("GET", "/api/changes", {user:null})).status).toBe(401);
  });
  it("only honours the dev user on localhost", async ()=>{
    expect((await send("GET", "/api/changes", {host:"myday.kasahkod.cc"})).status).toBe(401);
  });
  it("404s unknown paths and 405s wrong methods", async ()=>{
    expect((await send("GET", "/api/nope")).status).toBe(404);
    const r = await call("DELETE", "/api/days/2026-10-14");
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("PUT");
  });
});

describe("PUT /api/days/:date", ()=>{
  it("stores a day and returns it from /api/changes", async ()=>{
    expect(await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "Call the bank")})).toEqual({status:200, body:{ok:true, version:1}});
    const {body} = await send("GET", "/api/changes?since=0");
    expect(body).toEqual({days:[{...day("2026-10-14", "Call the bank"), version:1}], weeks:[], cursor:1, more:false});
  });

  it("fills defaults for task fields older docs lack", async ()=>{
    const doc = {date:"2026-10-14", updatedAt:"2026-10-14T09:00:00Z", tasks:[{id:"t1", text:"x", status:"done"}]};
    expect((await send("PUT", "/api/days/2026-10-14", {body:doc})).status).toBe(200);
    const {body} = await send("GET", "/api/changes");
    expect(body.days[0]).toEqual({date:"2026-10-14", dayNote:"", updatedAt:"2026-10-14T09:00:00.000Z", version:1,
      tasks:[{id:"t1", text:"x", status:"done", reason:"", note:"", from:null, carried:null}]});
  });

  it("refuses an older edit with 409 and the server's copy", async ()=>{
    await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "newer", "2026-10-14T10:00:00.000Z")});
    const r = await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "older", "2026-10-14T09:00:00.000Z")});
    expect(r.status).toBe(409);
    expect(r.body.server.tasks[0].text).toBe("newer");
    expect((await send("GET", "/api/changes")).body.days[0].tasks[0].text).toBe("newer");
  });

  it("accepts a newer edit, and the later arrival on a tie", async ()=>{
    await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "first")});
    expect((await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "tie")})).status).toBe(200);
    expect((await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "newer", "2026-10-14T11:00:00.000Z")})).body.version).toBe(3);
    const {body} = await send("GET", "/api/changes");
    expect(body.days.map(d=>d.tasks[0].text)).toEqual(["newer"]);
  });

  it("compares times across time zones correctly", async ()=>{
    await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "10:00 UTC", "2026-10-14T10:00:00.000Z")});
    // 17:30 in Kuala Lumpur is 09:30 UTC: older, even though "17:30" sorts after "10:00" as text
    expect((await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "09:30 UTC", "2026-10-14T17:30:00+08:00")})).status).toBe(409);
  });

  it("rejects bad input", async ()=>{
    const bad = async (path, body) => (await send("PUT", path, {body})).status;
    expect(await bad("/api/days/2026-02-30", day("2026-02-30", "x"))).toBe(400);
    expect(await bad("/api/days/2026-10-14", day("2026-10-15", "x"))).toBe(400);
    expect(await bad("/api/days/2026-10-14", "{not json")).toBe(400);
    expect(await bad("/api/days/2026-10-14", {...day("2026-10-14","x"), updatedAt:"yesterday"})).toBe(400);
    expect(await bad("/api/days/2026-10-14", {...day("2026-10-14","x"), tasks:[{id:"t1", text:"x", status:"maybe"}]})).toBe(400);
    expect(await bad("/api/days/2026-10-14", {...day("2026-10-14","x"), dayNote:"x".repeat(200_001)})).toBe(400);
    expect(await bad("/api/days/2026-10-14", "x".repeat(1_000_001))).toBe(413);
    expect(await bad("/api/days/%E0%A4%A", day("2026-10-14","x"))).toBe(400);
  });

  it("returns readable validation issues", async ()=>{
    const r = await send("PUT", "/api/days/2026-10-14", {body:{...day("2026-10-14","x"), tasks:[{id:"t1", text:"x", status:"maybe"}]}});
    expect(r.body.issues[0].path).toBe("tasks.0.status");
  });
});

describe("PUT /api/weeks/:weekStart", ()=>{
  it("stores a week note keyed by Monday", async ()=>{
    expect((await send("PUT", "/api/weeks/2026-10-12", {body:{note:"Goals", updatedAt:"2026-10-14T09:00:00Z"}})).status).toBe(200);
    expect((await send("GET", "/api/changes")).body.weeks).toEqual([{weekStart:"2026-10-12", note:"Goals", updatedAt:"2026-10-14T09:00:00.000Z", version:1}]);
  });
  it("refuses a week start that isn't a Monday", async ()=>{
    expect((await send("PUT", "/api/weeks/2026-10-13", {body:{note:"x", updatedAt:"2026-10-14T09:00:00Z"}})).status).toBe(400);
  });
  it("refuses an older edit with 409", async ()=>{
    await send("PUT", "/api/weeks/2026-10-12", {body:{note:"newer", updatedAt:"2026-10-14T10:00:00Z"}});
    const r = await send("PUT", "/api/weeks/2026-10-12", {body:{note:"older", updatedAt:"2026-10-14T09:00:00Z"}});
    expect(r).toMatchObject({status:409, body:{server:{weekStart:"2026-10-12", note:"newer"}}});
  });
});

describe("GET /api/changes", ()=>{
  it("pages through days and weeks in change order", async ()=>{
    await send("PUT", "/api/days/2026-10-13", {body:day("2026-10-13", "a")});         // 1
    await send("PUT", "/api/weeks/2026-10-12", {body:{note:"w", updatedAt:"2026-10-14T09:00:00Z"}}); // 2
    await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "b")});         // 3
    await send("PUT", "/api/days/2026-10-13", {body:day("2026-10-13", "a2", "2026-10-14T12:00:00Z")}); // 4

    const p1 = (await send("GET", "/api/changes?since=0&limit=2")).body;
    expect([p1.weeks.map(w=>w.version), p1.days.map(d=>d.version), p1.cursor, p1.more]).toEqual([[2], [3], 3, true]);
    const p2 = (await send("GET", `/api/changes?since=${p1.cursor}&limit=2`)).body;
    expect([p2.days.map(d=>d.tasks[0].text), p2.cursor, p2.more]).toEqual([["a2"], 4, false]);
    const p3 = (await send("GET", "/api/changes?since=4")).body;
    expect(p3).toEqual({days:[], weeks:[], cursor:4, more:false});
  });
  it("rejects a bad cursor", async ()=>{
    expect((await send("GET", "/api/changes?since=abc")).status).toBe(400);
    expect((await send("GET", "/api/changes?limit=501")).status).toBe(400);
  });
});

describe("users are kept apart", ()=>{
  it("never shows or overwrites another user's rows", async ()=>{
    await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "Amin's", "2026-10-14T12:00:00Z"), user:"amin"});
    expect((await send("PUT", "/api/days/2026-10-14", {body:day("2026-10-14", "Sara's"), user:"sara"})).body).toEqual({ok:true, version:1});
    expect((await send("GET", "/api/changes", {user:"sara"})).body.days.map(d=>d.tasks[0].text)).toEqual(["Sara's"]);
    expect((await send("GET", "/api/changes", {user:"amin"})).body.days.map(d=>d.tasks[0].text)).toEqual(["Amin's"]);
  });
});
