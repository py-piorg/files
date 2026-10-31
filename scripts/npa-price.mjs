// ============================================================================
//  TRIPLE A GAS — automatic LPG price from the NPA price floor
//
//  Runs on GitHub Actions (.github/workflows/npa-price.yml). The NPA posts
//  its price-floor PDFs late and as images, so the floor is read from the
//  Ghanaian business press, which reports every pricing window in plain text.
//
//  Customer price = NPA LPG floor + the owner's margin (set in the portal).
//  The job only changes prices when automatic pricing is on, the new pricing
//  window has started, and no manual price was published for this window.
//  firestore.rules re-checks all of that, so the bot cannot set any other price.
//
//  Env: TAG_PRICEBOT="username:password" (repository secret)
//       DRY_RUN=1 to only print what was found.
// ============================================================================

const API_KEY = 'AIzaSyAvkq7YEuJtD7IlsdcBE8hh9OX380YgeUg';
const PROJECT = 'triple-a-gas';
// TAG_EMULATOR=1 talks to the local Firebase emulators instead (for testing).
const EMU = process.env.TAG_EMULATOR === '1';
const DOCS = `${EMU ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com'}/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = `${EMU ? 'http://127.0.0.1:9099/' : 'https://'}identitytoolkit.googleapis.com/v1`;
const SIZES = ['3kg', '6kg', '12.5kg', '14.5kg'];
const SOURCES = [
  { name: 'Citi Newsroom', api: 'https://citinewsroom.com/wp-json/wp/v2/posts' },
  { name: 'MyJoyOnline', api: 'https://www.myjoyonline.com/wp-json/wp/v2/posts' }
];
const UA = 'Mozilla/5.0 (TripleAGas price bot; +https://tripleagas.com)';
const DRY = process.env.DRY_RUN === '1';

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const iso = d => d.toISOString().slice(0, 10);

// ── reading the news ─────────────────────────────────────────────────────
function decode(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '-').replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#8364;|&cent;|&#162;/g, '¢').replace(/&#8373;/g, '₵').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}

// Pricing windows start on the 1st and 16th. An article about a window is
// published a few days before it, so take the next start on/after (date - 1 day).
function windowFor(published) {
  const d = new Date(published.getTime() - 864e5);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (day <= 1) return new Date(Date.UTC(y, m, 1));
  if (day <= 16) return new Date(Date.UTC(y, m, 16));
  return new Date(Date.UTC(y, m + 1, 1));
}

/** Find the new LPG price floor (GH₵/kg) in an article, or null. */
function extractFloor(text) {
  const sentences = text.split(/(?<=[a-z0-9)%])\.\s+(?=[A-Z"'])/);
  const money = /GH\s?(?:¢|₵|S|C|c|\?)?\s?(\d{1,3}(?:\.\d{1,2})?)/g;
  for (const s of sentences) {
    if (!/\b(LPG|liquefied petroleum gas)\b/i.test(s)) continue;
    if (!/(floor|minimum price)/i.test(s)) continue;
    if (/(project|COMAC|COPEC|cash-purchase|expected to sell)/i.test(s)) continue;
    if (!/(per\s*kilo|\/\s*kg|per\s*kg)/i.test(s)) continue;
    // Only look at the part about LPG (sentences sometimes list petrol/diesel first).
    const part = s.slice(s.search(/\b(LPG|liquefied petroleum gas)\b/i));
    const to = /\bto\s+GH\s?(?:¢|₵|S|C|c|\?)?\s?(\d{1,3}(?:\.\d{1,2})?)/i.exec(part);
    if (to) return { floor: +to[1], sentence: s.trim() };
    const all = [...part.matchAll(money)].map(m => +m[1]);
    if (all.length === 1) return { floor: all[0], sentence: s.trim() };
  }
  return null;
}

async function json(url, opts = {}) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000), headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${url}\n${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function findLatestFloor() {
  const found = [];
  for (const src of SOURCES) {
    for (const q of ['LPG price floor', 'price floor']) {
      try {
        const posts = await json(`${src.api}?search=${encodeURIComponent(q)}&per_page=10&_fields=date_gmt,link,title,content`);
        for (const p of posts) {
          const hit = extractFloor(decode(p.content.rendered));
          if (!hit || hit.floor < 3 || hit.floor > 100) continue;
          const published = new Date(p.date_gmt + 'Z');
          found.push({ ...hit, source: src.name, url: p.link, title: decode(p.title.rendered), published, window: windowFor(published) });
        }
      } catch (e) { console.warn(`! ${src.name}: ${e.message.split('\n')[0]}`); }
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => b.window - a.window || b.published - a.published);
  const newest = found[0];
  const sameWindow = found.filter(f => +f.window === +newest.window);
  const values = [...new Set(sameWindow.map(f => f.floor))];
  return { ...newest, confirmations: sameWindow.length, conflict: values.length > 1 ? values : null };
}

// ── Firestore REST ───────────────────────────────────────────────────────
const toValue = v =>
  v === null || v === undefined ? { nullValue: null }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } }
  : { stringValue: String(v) };
const fromValue = v =>
  'nullValue' in v ? null : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? +v.integerValue
  : 'doubleValue' in v ? v.doubleValue : 'timestampValue' in v ? new Date(v.timestampValue) : 'stringValue' in v ? v.stringValue
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)])) : null;
const fieldPath = k => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ? k : '`' + k.replace(/`/g, '\\`') + '`');

async function signIn() {
  const [user, ...rest] = String(process.env.TAG_PRICEBOT || '').split(':');
  const password = rest.join(':');
  if (!user || !password) throw new Error('TAG_PRICEBOT secret is missing. Set it to "username:password" from the portal.');
  const r = await json(`${AUTH}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${user}@staff.tripleagas.com`, password, returnSecureToken: true })
  });
  return { token: r.idToken, uid: r.localId };
}
async function getDoc(token, path) {
  const r = await fetch(`${DOCS}/${path}`, { signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${r.status} reading ${path}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromValue(v)]));
}
function upsert(path, data, { timestamps = [] } = {}) {
  return {
    update: { name: `projects/${PROJECT}/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) },
    updateMask: { fieldPaths: Object.keys(data).map(fieldPath) },
    updateTransforms: timestamps.map(f => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' }))
  };
}
async function commit(token, writes) {
  return json(`${DOCS}:commit`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  let latest = await findLatestFloor();
  // Emulator-only test hook: pretend the news reported this floor/window.
  if (EMU && process.env.TEST_FLOOR) latest = { ...(latest || { source: 'test', url: '', title: 'test', sentence: 'test', confirmations: 1 }),
    floor: +process.env.TEST_FLOOR, window: new Date(process.env.TEST_WINDOW + 'T00:00:00Z'), conflict: null };
  if (latest) {
    console.log(`Found: LPG floor GH₵${latest.floor}/kg for window starting ${iso(latest.window)} (${latest.source}, ${latest.confirmations} article(s))`);
    console.log(`  "${latest.sentence}"\n  ${latest.url}`);
    if (latest.conflict) console.log(`  ! Sources disagree: ${latest.conflict.join(' vs ')}`);
  } else console.log('No NPA LPG price floor found in the news.');
  if (DRY) return;

  const { token, uid } = await signIn();
  const pricing = await getDoc(token, 'settings/pricing');
  const now = new Date();
  const status = { lastCheck: now, lastResult: '', bot: 'github-actions' };
  if (latest) Object.assign(status, { floor: latest.floor, window: iso(latest.window), source: latest.source, url: latest.url, title: latest.title, sentence: latest.sentence.slice(0, 400) });

  const skip = why => { status.lastResult = why; console.log('No price change: ' + why); return commit(token, [upsert('settings/npa', status)]); };

  if (!latest) return skip('No price-floor article found');
  if (latest.conflict) return skip(`News sources disagree (${latest.conflict.join(' vs ')}); keeping current price`);
  if (!pricing || pricing.auto !== true) return skip('Automatic pricing is switched off');
  if (latest.window > now) return skip(`New floor applies from ${iso(latest.window)}`);
  if (pricing.manualUntil && pricing.manualUntil > now) return skip(`Manual price set; automatic pricing resumes ${iso(pricing.manualUntil)}`);
  if (pricing.npaWindow === iso(latest.window) && pricing.npaFloor === latest.floor) return skip('Already up to date');
  if (typeof pricing.npaFloor === 'number' && (latest.floor < pricing.npaFloor * 0.6 || latest.floor > pricing.npaFloor * 1.6))
    return skip(`Floor ${latest.floor} is too far from last floor ${pricing.npaFloor}; please check and set manually`);

  const perKg = round2(latest.floor + (pricing.markupKg || 0));
  const autogasPerKg = round2(latest.floor + (pricing.autogasMarkupKg || 0));
  const exchange = Object.fromEntries(SIZES.map(s => [s, round2(parseFloat(s) * perKg)]));
  const update = { perKg, autogasPerKg, exchange, npaFloor: latest.floor, npaWindow: iso(latest.window), updatedBy: 'Automatic (NPA floor)',
    bulk_per_kg: perKg, autogas: autogasPerKg, ...exchange };
  status.lastResult = `Price set to GH₵${perKg}/kg (floor ${latest.floor} + margin ${pricing.markupKg || 0})`;
  status.appliedAt = now;

  await commit(token, [
    upsert('settings/pricing', update, { timestamps: ['updatedAt'] }),
    upsert(`priceHistory/auto_${iso(latest.window)}_${Date.now()}`, {
      old: { perKg: pricing.perKg, autogasPerKg: pricing.autogasPerKg, exchange: pricing.exchange || {} },
      new: { perKg, autogasPerKg, exchange }, note: `Automatic: NPA floor GH₵${latest.floor} (${latest.source})`,
      by: uid, byName: 'Automatic (NPA floor)'
    }, { timestamps: ['at'] }),
    upsert('settings/npa', status)
  ]);
  console.log(status.lastResult);
}

main().catch(e => { console.error(e.message); process.exit(1); });
