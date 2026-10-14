import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initStore, readDay, writeDay, readDays, readWeek, writeWeek, outbox, flushPending } from "./index.js";

class MemoryStorage {
  constructor(){ this.m = new Map(); }
  get length(){ return this.m.size; }
  key(i){ return [...this.m.keys()][i] ?? null; }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k,v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}

let n = 0;
const fresh = () => initStore({name:"test-"+(++n)});
const day = (date, text, updatedAt="2026-10-13T09:00:00.000Z") =>
  ({date, dayNote:"", updatedAt, tasks:[{id:"a1", text, status:"open", reason:"", note:"", from:null, carried:null}]});

beforeEach(()=>{ globalThis.localStorage = new MemoryStorage(); });

describe("days", ()=>{
  it("round-trips a day doc and returns null for a missing day", async ()=>{
    await fresh();
    await writeDay("2026-10-13", day("2026-10-13", "Call the bank"));
    expect((await readDay("2026-10-13")).tasks[0].text).toBe("Call the bank");
    expect(await readDay("2026-10-14")).toBeNull();
  });

  it("queries a date range, inclusive start and exclusive end", async ()=>{
    await fresh();
    for (const d of ["2026-10-11","2026-10-12","2026-10-13","2026-10-14"]) await writeDay(d, day(d, d));
    const got = await readDays("2026-10-12", "2026-10-14");
    expect(got.map(d=>d.date)).toEqual(["2026-10-12","2026-10-13"]);
    expect(await readDays("2026-10-14", "2026-10-14")).toEqual([]);
  });

  it("marks every write in the outbox and clears its localStorage copy", async ()=>{
    await fresh();
    await writeDay("2026-10-13", day("2026-10-13", "x"));
    await writeWeek("2026-10-12", {note:"<b>goals</b>", updatedAt:"2026-10-13T09:00:00.000Z"});
    expect((await outbox()).map(o=>o.key).sort()).toEqual(["days:2026-10-13","weeks:2026-10-12"]);
    expect(localStorage.length).toBe(1); // only the migration marker
  });
});

describe("week notes", ()=>{
  it("round-trips a week note keyed by its Monday", async ()=>{
    await fresh();
    await writeWeek("2026-10-12", {note:"Plan the trip", updatedAt:"2026-10-13T09:00:00.000Z"});
    expect(await readWeek("2026-10-12")).toMatchObject({weekStart:"2026-10-12", note:"Plan the trip"});
  });
});

describe("writes interrupted before IndexedDB committed", ()=>{
  it("are replayed on the next launch", async ()=>{
    await fresh();
    localStorage.setItem("dp:pending:days:2026-10-13", JSON.stringify(day("2026-10-13", "typed just before iOS closed the app")));
    await flushPending();
    expect((await readDay("2026-10-13")).tasks[0].text).toBe("typed just before iOS closed the app");
    expect(localStorage.getItem("dp:pending:days:2026-10-13")).toBeNull();
  });

  it("never overwrite a newer version already saved", async ()=>{
    await fresh();
    await writeDay("2026-10-13", day("2026-10-13", "newer", "2026-10-13T10:00:00.000Z"));
    localStorage.setItem("dp:pending:days:2026-10-13", JSON.stringify(day("2026-10-13", "older", "2026-10-13T09:00:00.000Z")));
    await flushPending();
    expect((await readDay("2026-10-13")).tasks[0].text).toBe("newer");
    expect(localStorage.getItem("dp:pending:days:2026-10-13")).toBeNull();
  });

  it("drop copies that are unreadable or for an unknown store", async ()=>{
    await fresh();
    localStorage.setItem("dp:pending:days:2026-10-13", "{not json");
    localStorage.setItem("dp:pending:other:x", "{}");
    await flushPending();
    expect(await readDay("2026-10-13")).toBeNull();
    expect(localStorage.length).toBe(1);
  });
});

describe("moving data from the localStorage version", ()=>{
  it("copies days and week notes once, keeping the old keys", async ()=>{
    localStorage.setItem("dp:day:2026-10-13", JSON.stringify(day("2026-10-13", "from localStorage")));
    localStorage.setItem("dp:index", JSON.stringify(["2026-10-13"]));
    localStorage.setItem("dp:week:2026-10-12", JSON.stringify({weekOf:"2026-10-12", note:"week goals", updatedAt:"2026-10-13T09:00:00.000Z"}));
    localStorage.setItem("dp:view", "month");
    await fresh();
    expect((await readDay("2026-10-13")).tasks[0].text).toBe("from localStorage");
    expect(await readWeek("2026-10-12")).toEqual({weekStart:"2026-10-12", note:"week goals", updatedAt:"2026-10-13T09:00:00.000Z"});
    expect(localStorage.getItem("dp:day:2026-10-13")).not.toBeNull();
    expect((await outbox()).length).toBe(2);
  });

  it("doesn't run again, and never overwrites what IndexedDB has", async ()=>{
    const name = "test-"+(++n);
    await initStore({name});
    await writeDay("2026-10-13", day("2026-10-13", "kept"));
    localStorage.removeItem("dp:migrated-to-idb");
    localStorage.setItem("dp:day:2026-10-13", JSON.stringify(day("2026-10-13", "stale")));
    await initStore({name});
    expect((await readDay("2026-10-13")).tasks[0].text).toBe("kept");

    localStorage.setItem("dp:day:2026-10-14", JSON.stringify(day("2026-10-14", "added after migration")));
    await initStore({name});
    expect(await readDay("2026-10-14")).toBeNull();
  });
});
