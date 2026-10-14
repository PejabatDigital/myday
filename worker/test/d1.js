/* A small stand-in for Cloudflare D1, backed by Node's built-in SQLite, for tests.
   Covers what the API uses: prepare().bind().first()/all()/run() and batch() (one transaction). */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

class Statement {
  constructor(db, sql, args=[]){ this.db = db; this.sql = sql; this.args = args; }
  bind(...args){ return new Statement(this.db, this.sql, args); }
  // D1 binds ?1, ?2… by position; node:sqlite treats them as names "1", "2"…
  params(){ return /\?\d/.test(this.sql) ? [Object.fromEntries(this.args.map((a,i)=>[i+1, a]))] : this.args; }
  rows(){ return this.db.prepare(this.sql).all(...this.params()).map(r=>({...r})); }
  async all(){ return {results:this.rows(), success:true}; }
  async first(col){ const [r] = this.rows(); return r ? (col ? r[col] : r) : null; }
  async run(){ const i = this.db.prepare(this.sql).run(...this.params()); return {success:true, meta:{changes:i.changes}}; }
}

export function testD1(){
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../migrations/", import.meta.url);
  readdirSync(dir).filter(f=>f.endsWith(".sql")).sort().forEach(f=>db.exec(readFileSync(new URL(f, dir), "utf8")));
  return {
    prepare: sql => new Statement(db, sql),
    async batch(stmts){
      db.exec("BEGIN");
      try { const out = stmts.map(s=>({results:s.rows(), success:true})); db.exec("COMMIT"); return out; }
      catch(e){ db.exec("ROLLBACK"); throw e; }
    },
  };
}
