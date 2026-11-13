import { json, auth, DEFAULT_CATEGORIES, readCategories, writeCustomCategories, readJobs } from '../_lib.js';

// Public: all categories (built-in + added ones).
export async function onRequestGet({ env }) {
  return json({ categories: await readCategories(env), defaults: DEFAULT_CATEGORIES });
}

// Signed-in only: add a category.
export async function onRequestPost({ request, env }) {
  if (!(await auth(request, env))) return json({ error: 'Please sign in.' }, 401);
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const name = String(body.name == null ? '' : body.name).replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return json({ error: 'Category name is required.' }, 400);
  const all = await readCategories(env);
  if (all.some((c) => c.toLowerCase() === name.toLowerCase())) return json({ error: 'This category already exists.' }, 409);
  const custom = all.filter((c) => !DEFAULT_CATEGORIES.includes(c));
  custom.push(name);
  await writeCustomCategories(env, custom);
  return json({ categories: await readCategories(env) }, 201);
}

// Signed-in only: delete an added category (built-in ones and ones used by jobs cannot be deleted).
export async function onRequestDelete({ request, env }) {
  if (!(await auth(request, env))) return json({ error: 'Please sign in.' }, 401);
  const name = new URL(request.url).searchParams.get('name') || '';
  if (DEFAULT_CATEGORIES.includes(name)) return json({ error: 'Built-in categories cannot be deleted.' }, 400);
  const jobs = await readJobs(env);
  if (jobs.some((j) => j.category === name)) return json({ error: 'Some jobs use this category. Change or delete those jobs first.' }, 400);
  let custom = [];
  try { custom = JSON.parse((await env.JOBS.get('categories')) || '[]'); } catch (e) {}
  custom = (Array.isArray(custom) ? custom : []).filter((c) => c !== name);
  await writeCustomCategories(env, custom);
  return json({ categories: await readCategories(env) });
}
