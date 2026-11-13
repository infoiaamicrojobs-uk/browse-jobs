// Shared helpers for the Browse Jobs API (Cloudflare Pages Functions)
export const DEFAULT_CATEGORIES = ['Web & IT','Design & Creative','Writing & Translation','Marketing','Video & Animation','Admin & Support','Other'];
export const TYPES = ['Full-time','Part-time','Contract','Freelance','Internship'];

const enc = new TextEncoder();

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const b64u = (bytes) => {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uToStr = (str) => {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return decodeURIComponent(escape(atob(str)));
};
const strToB64u = (str) => b64u(enc.encode(str));

async function sign(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

async function safeEqual(a, b) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

// Returns { role, token } or null. Credentials come from environment variables.
export async function login(env, username, password) {
  if (!env.SESSION_SECRET) return null;
  const accounts = [
    { role: 'admin', user: env.ADMIN_USER, pass: env.ADMIN_PASS },
    { role: 'manager', user: env.MANAGER_USER, pass: env.MANAGER_PASS },
  ];
  for (const a of accounts) {
    if (!a.user || !a.pass) continue;
    const okUser = await safeEqual(username, a.user);
    const okPass = await safeEqual(password, a.pass);
    if (okUser && okPass) {
      const payload = strToB64u(JSON.stringify({ role: a.role, exp: Date.now() + 7 * 24 * 3600 * 1000 }));
      return { role: a.role, token: payload + '.' + (await sign(env.SESSION_SECRET, payload)) };
    }
  }
  return null;
}

// Returns { role } for a valid token, otherwise null.
export async function auth(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !env.SESSION_SECRET) return null;
  if (!(await safeEqual(sig, await sign(env.SESSION_SECRET, payload)))) return null;
  try {
    const data = JSON.parse(b64uToStr(payload));
    if (!data.exp || data.exp < Date.now()) return null;
    if (data.role !== 'admin' && data.role !== 'manager') return null;
    return { role: data.role };
  } catch (e) {
    return null;
  }
}

export async function readJobs(env) {
  try {
    const raw = await env.JOBS.get('jobs');
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

// Built-in categories + categories added by admin/manager + any category already used by a job (e.g. after a restore).
export async function readCategories(env) {
  let custom = [];
  try { custom = JSON.parse((await env.JOBS.get('categories')) || '[]'); } catch (e) {}
  if (!Array.isArray(custom)) custom = [];
  const used = (await readJobs(env)).map((j) => j.category);
  const out = DEFAULT_CATEGORIES.filter((c) => c !== 'Other');
  [...custom, ...used].forEach((c) => { if (c && !out.includes(c) && c !== 'Other') out.push(c); });
  out.push('Other');
  return out;
}
export const writeCustomCategories = (env, list) => env.JOBS.put('categories', JSON.stringify(list));
export const writeJobs = (env, jobs) => env.JOBS.put('jobs', JSON.stringify(jobs));

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// Validates and cleans a job. Returns { job } or { error }.
export function cleanJob(input) {
  input = input || {};
  const title = clip(input.title, 120);
  const company = clip(input.company, 80);
  const description = clip(input.description, 5000);
  if (!title) return { error: 'Job title is required.' };
  if (!description) return { error: 'Description is required.' };
  if (!company) return { error: 'Company or author name is required.' };

  let applyUrl = clip(input.applyUrl, 500);
  if (applyUrl) {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(applyUrl)) applyUrl = 'https://' + applyUrl;
    try {
      const u = new URL(applyUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad');
      applyUrl = u.toString();
    } catch (e) {
      return { error: 'Apply link must be a valid web address (for example a Google Form link).' };
    }
  }
  return {
    job: {
      title,
      company,
      description,
      category: clip(input.category, 40) || 'Other',
      type: TYPES.includes(input.type) ? input.type : 'Full-time',
      location: clip(input.location, 80),
      salary: clip(input.salary, 60),
      salaryCurrency: ['BDT', 'USD'].includes(input.salaryCurrency) ? input.salaryCurrency : '',
      rating: Math.max(0, Math.min(5, Math.round(Number(input.rating)) || 0)),
      applyUrl,
    },
  };
}
