import { json, auth, readJobs, writeJobs, cleanJob } from '../_lib.js';

// Download a JSON backup (admin and manager).
export async function onRequestGet({ request, env }) {
  if (!(await auth(request, env))) return json({ error: 'Please sign in.' }, 401);
  const jobs = await readJobs(env);
  return new Response(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), jobs }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="browse-jobs-backup.json"',
      'cache-control': 'no-store',
    },
  });
}

// Restore from a JSON backup (admin only). Replaces all current jobs.
export async function onRequestPost({ request, env }) {
  const user = await auth(request, env);
  if (!user) return json({ error: 'Please sign in.' }, 401);
  if (user.role !== 'admin') return json({ error: 'Restore is not available for this account.' }, 403);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const list = Array.isArray(body) ? body : body.jobs;
  if (!Array.isArray(list)) return json({ error: 'This file is not a valid backup.' }, 400);
  const jobs = [];
  for (const item of list.slice(0, 2000)) {
    const { job } = cleanJob(item);
    if (!job) continue;
    job.id = typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : crypto.randomUUID();
    job.createdAt = typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString();
    jobs.push(job);
  }
  await writeJobs(env, jobs);
  return json({ ok: true, count: jobs.length });
}
