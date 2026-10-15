/* Day and week documents (shapes in CLAUDE.md, Data), shared by the app and sync. */

export const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// notes from the first version of the app are plain text; anything with these tags is HTML
export const RICH = /<\/?(b|strong|i|em|u|s|strike|del|br|p|div|ul|ol|li|h[1-6]|blockquote|a)\b/i;

export function emptyDay(date){ return {date, tasks:[], dayNote:""}; }

/* A clean copy of a stored day, whatever version of the app wrote it. */
export function normalize(d, date){
  d = d ? JSON.parse(JSON.stringify(d)) : {};
  const out = {date, tasks:[], dayNote: typeof d.dayNote==="string" ? d.dayNote : ""};
  if (Array.isArray(d.tasks)) out.tasks = d.tasks.filter(t=>t && t.id).map(t=>({
    id:String(t.id), text:String(t.text||""), status:["open","done","missed","cf"].includes(t.status)?t.status:"open",
    reason:String(t.reason||""), note:String(t.note||""), from:t.from||null, carried:t.carried||null }));
  if (d.updatedAt) out.updatedAt = d.updatedAt;
  return out;
}

/* Two notes as one: both kept, this device's first. */
export function joinNotes(mine, theirs){
  mine = mine||""; theirs = theirs||"";
  const html = s => RICH.test(s) ? s : esc(s).replace(/\n/g,"<br>");
  if (!theirs.trim() || mine===theirs || html(mine).includes(html(theirs))) return mine;
  if (!mine.trim()) return theirs;
  return html(mine)+"<br><br>"+html(theirs);
}

/* Used once per device, on its first sync: every task from both versions of a day, this
   device's first, and both day notes. Returns null if this device already has it all. */
export function combineDays(mine, theirs){
  const a = normalize(mine, mine.date), b = normalize(theirs, mine.date);
  const ids = new Set(a.tasks.map(t=>t.id));
  const extra = b.tasks.filter(t=>!ids.has(t.id));
  const dayNote = joinNotes(a.dayNote, b.dayNote);
  if (!extra.length && dayNote===a.dayNote) return null;
  return {...a, tasks:a.tasks.concat(extra), dayNote, updatedAt:new Date().toISOString()};
}
