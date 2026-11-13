import { json, login } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const result = await login(env, String(body.username || ''), String(body.password || ''));
  if (!result) return json({ error: 'Incorrect username or password.' }, 401);
  return json(result);
}
