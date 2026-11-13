import { json, auth, readJobs, writeJobs, cleanJob } from '../../_lib.js';

export async function onRequestPut({ request, env, params }) {
  if (!(await auth(request, env))) return json({ error: 'Please sign in.' }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const { job, error } = cleanJob(body);
  if (error) return json({ error }, 400);
  const jobs = await readJobs(env);
  const i = jobs.findIndex((j) => j.id === params.id);
  if (i < 0) return json({ error: 'Job not found.' }, 404);
  jobs[i] = { ...jobs[i], ...job, id: jobs[i].id, createdAt: jobs[i].createdAt };
  await writeJobs(env, jobs);
  return json({ job: jobs[i] });
}

export async function onRequestDelete({ request, env, params }) {
  if (!(await auth(request, env))) return json({ error: 'Please sign in.' }, 401);
  const jobs = await readJobs(env);
  const next = jobs.filter((j) => j.id !== params.id);
  if (next.length === jobs.length) return json({ error: 'Job not found.' }, 404);
  await writeJobs(env, next);
  return json({ ok: true });
}
