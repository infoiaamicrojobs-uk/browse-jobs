import { json, auth, readJobs, writeJobs, cleanJob } from '../_lib.js';

// Public: list all jobs (newest first).
export async function onRequestGet({ env }) {
  return json({ jobs: await readJobs(env) });
}

// Signed-in only: create a job.
export async function onRequestPost({ request, env }) {
  if (!(await auth(request, env))) return json({ error: 'Please sign in.' }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const { job, error } = cleanJob(body);
  if (error) return json({ error }, 400);
  job.id = crypto.randomUUID();
  job.createdAt = new Date().toISOString(); // used only for ordering, never shown
  const jobs = await readJobs(env);
  jobs.unshift(job);
  await writeJobs(env, jobs);
  return json({ job }, 201);
}
