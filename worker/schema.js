/* Input validation for the API. Shapes match the day and week documents in CLAUDE.md. */
import { z } from "zod";

export const NOTE_MAX = 200_000;    // characters of note HTML
export const BODY_MAX = 1_000_000;  // bytes per request body

/* A real calendar date, YYYY-MM-DD. */
export function isDate(s){
  if (typeof s!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d] = s.split("-").map(Number), t = new Date(Date.UTC(y, m-1, d));
  return t.getUTCFullYear()===y && t.getUTCMonth()===m-1 && t.getUTCDate()===d;
}
export const isMonday = s => isDate(s) && new Date(s+"T00:00:00Z").getUTCDay()===1;

const date = z.string().refine(isDate, "must be a date (YYYY-MM-DD)");
// stored as a canonical UTC ISO string, so stored times compare correctly as text
const time = z.iso.datetime({offset:true}).transform(s=>new Date(s).toISOString());

const task = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(5_000),
  status: z.enum(["open","done","missed","cf"]),
  reason: z.string().max(5_000).default(""),
  note: z.string().max(NOTE_MAX).default(""),
  from: date.nullable().default(null),
  carried: date.nullable().default(null),
});

export const dayDoc = z.object({
  date,
  dayNote: z.string().max(NOTE_MAX).default(""),
  updatedAt: time,
  tasks: z.array(task).max(1_000),
});

export const weekDoc = z.object({
  note: z.string().max(NOTE_MAX),
  updatedAt: time,
});

export const changesQuery = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
