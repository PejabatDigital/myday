/* D1 queries. Every query is scoped to one user_id. */

/* Stores a doc unless the server already holds a newer edit (whole-document last write wins,
   by updatedAt; on a tie the later arrival wins). Runs as one D1 batch, so it's atomic.
   Returns {ok:true, version} or {ok:false, server:{…stored doc}, version}. */
async function put(db, userId, table, key, keyCol, valueCol, value, updatedAt){
  const [, , [row]] = (await db.batch([
    db.prepare("INSERT INTO sync_seq (user_id, seq) VALUES (?1, 1) ON CONFLICT (user_id) DO UPDATE SET seq = seq + 1").bind(userId),
    db.prepare(`INSERT INTO ${table} (user_id, ${keyCol}, ${valueCol}, updated_at, version)
                VALUES (?1, ?2, ?3, ?4, (SELECT seq FROM sync_seq WHERE user_id = ?1))
                ON CONFLICT (user_id, ${keyCol}) DO UPDATE
                  SET ${valueCol} = excluded.${valueCol}, updated_at = excluded.updated_at, version = excluded.version
                  WHERE excluded.updated_at >= ${table}.updated_at`).bind(userId, key, value, updatedAt),
    db.prepare(`SELECT t.${valueCol} AS value, t.updated_at, t.version, s.seq
                FROM ${table} t JOIN sync_seq s ON s.user_id = t.user_id
                WHERE t.user_id = ?1 AND t.${keyCol} = ?2`).bind(userId, key),
  ])).map(r=>r.results);
  return {ok: row.version===row.seq, version: row.version, value: row.value, updatedAt: row.updated_at};
}

export async function putDay(db, userId, doc){
  const r = await put(db, userId, "days", doc.date, "date", "body", JSON.stringify(doc), doc.updatedAt);
  return r.ok ? {ok:true, version:r.version} : {ok:false, version:r.version, server:JSON.parse(r.value)};
}

export async function putWeek(db, userId, weekStart, doc){
  const r = await put(db, userId, "weeks", weekStart, "week_start", "note", doc.note, doc.updatedAt);
  return r.ok ? {ok:true, version:r.version} : {ok:false, version:r.version, server:{weekStart, note:r.value, updatedAt:r.updatedAt}};
}

/* Everything changed after `since`, oldest first, up to `limit` docs across days and weeks. */
export async function changes(db, userId, since, limit){
  const [days, weeks] = (await db.batch([
    db.prepare("SELECT date, body, version FROM days WHERE user_id = ?1 AND version > ?2 ORDER BY version LIMIT ?3").bind(userId, since, limit+1),
    db.prepare("SELECT week_start, note, updated_at, version FROM weeks WHERE user_id = ?1 AND version > ?2 ORDER BY version LIMIT ?3").bind(userId, since, limit+1),
  ])).map(r=>r.results);
  const all = [
    ...days.map(r=>({version:r.version, day:JSON.parse(r.body)})),
    ...weeks.map(r=>({version:r.version, week:{weekStart:r.week_start, note:r.note, updatedAt:r.updated_at}})),
  ].sort((a,b)=>a.version-b.version);
  const page = all.slice(0, limit);
  return {
    days: page.filter(c=>c.day).map(c=>({...c.day, version:c.version})),
    weeks: page.filter(c=>c.week).map(c=>({...c.week, version:c.version})),
    cursor: page.length ? page[page.length-1].version : since,
    more: all.length > limit,
  };
}
