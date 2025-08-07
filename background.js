// MV3 service worker for scheduling daily prayer notifications

const DEFAULT_SETTINGS = {
  latitude: 48.5734,
  longitude: 7.7521,
  calcMethod: 'auto',
  notifyFor: {
    Fajr: true,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true,
  },
  minutesBefore: 0, // 0 = at time, positive = minutes before
  refreshHourLocal: 3 // hour of day to refresh times (local time)
};

// Utility: sleep
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Fetch prayer times from the mosque page by parsing the HTML.
// Strategy: search the HTML for each prayer label (with synonyms) and capture the next time token nearby.
// Fetch prayer times from a reliable API by position (Aladhan)
async function fetchPrayerTimesByPosition(lat, lng, method) {
  const d = new Date();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    method: method === 'auto' ? '2' : String(method)
  });
  const url = `https://api.aladhan.com/v1/timings/${day}-${month}-${year}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API failed: ${res.status}`);
  const data = await res.json();
  const t = data?.data?.timings || {};
  const map = (v) => v ? v.replace(/\s*\(.+\)$/, '') : null; // strip (CEST) etc.
  return {
    Fajr: normalizeTo24h(map(t.Fajr)),
    Dhuhr: normalizeTo24h(map(t.Dhuhr || t.Dhuhr)),
    Asr: normalizeTo24h(map(t.Asr)),
    Maghrib: normalizeTo24h(map(t.Maghrib)),
    Isha: normalizeTo24h(map(t.Isha))
  };
}

async function tryScrapeTimesViaTab(mosqueUrl, waitMs = 3000) {
  // Create an inactive tab to run a content script, wait, then read DOM
  const tab = await chrome.tabs.create({ url: mosqueUrl, active: false });
  try {
    await new Promise(res => setTimeout(res, waitMs));
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const out = {};
        const container = document.querySelector('div.prayers');
        if (!container) return out;
        const order = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
        const blocks = Array.from(container.children);
        const times = blocks.map(b => (b.querySelector('.time > div') || b.querySelector('.time'))?.textContent?.trim()).filter(Boolean);
        const names = blocks.map(b => b.querySelector('.name')?.textContent?.trim()).filter(Boolean);
        for (let i = 0; i < Math.max(names.length, times.length); i++) {
          const key = (names[i] || order[i] || '').trim();
          const normKey = key.toLowerCase();
          let mapKey = null;
          if (['fajr','fajer','subh'].includes(normKey)) mapKey = 'Fajr';
          else if (['dhuhr','duhr','dohr','zuhur','zuhr'].includes(normKey)) mapKey = 'Dhuhr';
          else if (['asr'].includes(normKey)) mapKey = 'Asr';
          else if (['maghrib','maghreb'].includes(normKey)) mapKey = 'Maghrib';
          else if (['isha','ishaa','ichaa'].includes(normKey)) mapKey = 'Isha';
          else if (order[i]) mapKey = order[i];
          const t = times[i];
          if (mapKey && t) out[mapKey] = t;
        }
        return out;
      }
    });
    // Normalize times to 24h
    const normalized = {};
    for (const [k, v] of Object.entries(result || {})) {
      if (v && /\d{1,2}:\d{2}/.test(v)) {
        try { normalized[k] = normalizeTo24h(v); } catch (_e) {}
      }
    }
    return normalized;
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (_e) {}
  }
}

async function fetchPrayerTimesFromApiIfConfigured() {
  const settings = await loadSettings();
  if (!settings.apiUrl) return null;
  let url = settings.apiUrl;
  if (settings.mosqueId) url = url.replace('{id}', settings.mosqueId);
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const mapped = mapJsonTimes(json);
    return mapped;
  } catch (_e) {
    return null;
  }
}

function mapJsonTimes(json) {
  // Accept both flat and nested shapes
  const tryKeys = (obj) => {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    const get = (k) => obj[k] ?? obj[k?.toLowerCase?.()] ?? obj[k?.toUpperCase?.()];
    const m = get('times') || get('prayerTimes') || obj;
    const val = (k) => m?.[k] ?? m?.[k?.toLowerCase?.()] ?? m?.[k?.toUpperCase?.()];
    const candidates = {
      Fajr: ['Fajr','fajr','FAJR','Subh','subh'],
      Dhuhr: ['Dhuhr','dhuhr','DHUHR','Dohr','dohr','Zuhr','zuhr','Zuhur','zuhur','Duhr','duhr'],
      Asr: ['Asr','asr','ASR'],
      Maghrib: ['Maghrib','maghrib','MAGHRIB','Maghreb','maghreb'],
      Isha: ['Isha','isha','ISHAA','ISHA','Ichaa','ichaa','Ishaa','ishaa']
    };
    for (const [kk, list] of Object.entries(candidates)) {
      for (const key of list) {
        const v = val(key);
        if (typeof v === 'string' && /\d{1,2}:\d{2}/.test(v)) { out[kk] = normalizeTo24h(v); break; }
      }
    }
    return out;
  };
  let r = tryKeys(json);
  if (Object.keys(r).length >= 3) return r;
  for (const k of Object.keys(json || {})) {
    if (json && typeof json[k] === 'object') {
      r = tryKeys(json[k]);
      if (Object.keys(r).length >= 3) return r;
    }
  }
  return r;
}

function tryParseNuxtPayload(html) {
  const m = html.match(/(?:window\.__NUXT__|__NUXT__)\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return null;
  const jsonStr = m[1];
  try {
    return JSON.parse(jsonStr);
  } catch (_e) {
    // Attempt to sanitize common non-JSON tokens
    try {
      const sanitized = jsonStr
        .replace(/undefined/g, 'null')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      return JSON.parse(sanitized);
    } catch (_e2) {
      return null;
    }
  }
}

function extractTimesFromObject(obj) {
  const result = {};
  const synonyms = {
    Fajr: ["fajr", "subh", "fajer"],
    Dhuhr: ["dhuhr", "dohr", "duhr", "zuhur", "zuhr"],
    Asr: ["asr"],
    Maghrib: ["maghrib", "maghreb"],
    Isha: ["isha", "ichaa", "ishaa"],
  };
  const timePattern = /^\s*([0-2]?\d:[0-5]\d)(?:\s?(AM|PM))?\s*$/i;

  function visit(node, pathKeys = []) {
    if (node && typeof node === 'object') {
      if (Array.isArray(node)) {
        for (const item of node) visit(item, pathKeys);
      } else {
        for (const [k, v] of Object.entries(node)) {
          const keyLower = k.toLowerCase();
          if (typeof v === 'string' && timePattern.test(v)) {
            for (const [pray, keys] of Object.entries(synonyms)) {
              if (keys.some(s => keyLower.includes(s))) {
                if (!result[pray]) result[pray] = normalizeTo24h(v);
              }
            }
          }
          visit(v, pathKeys.concat(k));
        }
      }
    }
  }
  visit(obj);
  return result;
}

function extractTimesFromAthanSection(html) {
  const lower = html.toLowerCase();
  let start = lower.indexOf('al-athan');
  if (start === -1) start = lower.indexOf('athan');
  if (start === -1) return {};
  let end = lower.indexOf('al-iqama', start + 1);
  if (end === -1) end = Math.min(html.length, start + 12000);
  const block = html.slice(start, end);

  const labelSynonyms = {
    Fajr: ["fajr", "subh", "fajer"],
    Dhuhr: ["dhuhr", "dohr", "duhr", "zuhur", "zuhr"],
    Asr: ["asr"],
    Maghrib: ["maghrib", "maghreb"],
    Isha: ["isha", "ichaa", "ishaa"],
  };

  const result = {};
  const blockLower = block.toLowerCase();

  // Collect times from <div class="time"> ... possibly nested ... </div>
  const timeDivRe = /<div[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  const timeTokenRe = /([0-2]?\d:[0-5]\d(?:\s?(?:AM|PM))?)/i;
  const found = [];
  let m;
  while ((m = timeDivRe.exec(block)) !== null) {
    const inner = m[1];
    const t = inner.match(timeTokenRe);
    if (t && t[1]) {
      const norm = normalizeTo24h(t[1]);
      if (!found.includes(norm)) found.push(norm);
    }
    if (found.length >= 5) break;
  }
  if (found.length >= 3) {
    const order = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
    for (let i = 0; i < Math.min(found.length, order.length); i++) {
      if (!result[order[i]]) result[order[i]] = found[i];
    }
  }

  // If some are still missing, attempt label-nearby capture using the .time container
  if (Object.keys(result).length < 5) {
    const labelSynonymsEntries = Object.entries(labelSynonyms);
    for (const [prayer, syns] of labelSynonymsEntries) {
      if (result[prayer]) continue;
      let bestIdx = -1;
      for (const s of syns) {
        const idx = blockLower.indexOf(s);
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
      }
      if (bestIdx !== -1) {
        const windowHtml = block.slice(bestIdx, Math.min(block.length, bestIdx + 1800));
        const mm = timeDivRe.exec(windowHtml) || windowHtml.match(timeTokenRe);
        if (mm) {
          const tok = Array.isArray(mm) ? mm[1] : (mm[1] && mm[1].match(timeTokenRe)?.[1]);
          if (tok) result[prayer] = normalizeTo24h(tok);
        }
      }
    }
  }
  return result;
}

function labelToKey(raw) {
  const t = String(raw || '').replace(/<[^>]+>/g, '').trim().toLowerCase();
  if (!t) return null;
  if (["fajr", "fajer", "subh"].includes(t)) return "Fajr";
  if (["dhuhr", "duhr", "dohr", "zuhur", "zuhr"].includes(t)) return "Dhuhr";
  if (["asr"].includes(t)) return "Asr";
  if (["maghrib", "maghreb"].includes(t)) return "Maghrib";
  if (["isha", "ishaa", "ichaa"].includes(t)) return "Isha";
  return null;
}

function extractTimesFromPrayersContainer(html) {
  const lower = html.toLowerCase();
  let idx = lower.indexOf('class="prayers"');
  if (idx === -1) idx = lower.indexOf("class='prayers'");
  if (idx === -1) idx = lower.indexOf('prayers');
  if (idx === -1) return {};
  const block = html.slice(idx, Math.min(html.length, idx + 20000));

  // Pair-wise capture: .name ... then nearest following .time with HH:MM
  const pairRe = /<div[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>[\s\S]*?([0-2]?\d:[0-5]\d(?:\s?(?:AM|PM))?)[\s\S]*?<\/div>/gi;
  const result = {};
  let m;
  while ((m = pairRe.exec(block)) !== null) {
    const labelRaw = m[1];
    const timeRaw = m[2];
    const key = labelToKey(labelRaw);
    if (!key || result[key]) continue;
    result[key] = normalizeTo24h(timeRaw);
  }
  return result;
}

function extractTimesFromPrayersContainerStrict(html) {
  // Locate the prayers container and extract the full balanced <div>...</div> block
  const block = extractDivBlockByClass(html, 'prayers');
  if (!block) return {};
  // Strict: iterate immediate child <div> blocks via balanced scanning
  const children = extractImmediateChildDivs(block);
  const result = {};
  const nameRe = /<div[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;
  const timeInnerRe = /<div[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>[\s\S]*?<div[^>]*>\s*([0-2]?\d:[0-5]\d(?:\s?(?:AM|PM))?)\s*<\/div>[\s\S]*?<\/div>/i;
  const order = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
  let orderIdx = 0;
  for (const child of children) {
    const nm = child.match(nameRe);
    const tm = child.match(timeInnerRe);
    if (!tm) continue;
    const timeValue = tm[1];
    let key = nm ? labelToKey(nm[1]) : null;
    if (!key && orderIdx < order.length) {
      key = order[orderIdx++];
    }
    if (key && !result[key]) {
      try { result[key] = normalizeTo24h(timeValue); } catch (_e) {}
    }
  }
  return result;
}

function extractDivBlockByClass(html, className) {
  const lower = html.toLowerCase();
  const classNeedle1 = `class="${className}`;
  const classNeedle2 = `class='${className}`;
  let classIdx = lower.indexOf(classNeedle1);
  if (classIdx === -1) classIdx = lower.indexOf(classNeedle2);
  if (classIdx === -1) {
    // fallback: any occurrence of the class name
    classIdx = lower.indexOf(className);
  }
  if (classIdx === -1) return null;

  // Find the start of the enclosing <div ...>
  const startTagIdx = lower.lastIndexOf('<div', classIdx);
  if (startTagIdx === -1) return null;

  const divTagRe = /<div\b|<\/div>/gi;
  divTagRe.lastIndex = startTagIdx;
  let depth = 0;
  let startSeen = false;
  let m;
  while ((m = divTagRe.exec(html)) !== null) {
    if (m[0].toLowerCase() === '<div') {
      depth += 1;
      startSeen = true;
    } else {
      depth -= 1;
      if (startSeen && depth === 0) {
        const endIdx = divTagRe.lastIndex;
        return html.slice(startTagIdx, endIdx);
      }
    }
  }
  return null;
}

function extractImmediateChildDivs(divBlockHtml) {
  // divBlockHtml starts with <div ...> ... </div>
  const startTagEnd = divBlockHtml.indexOf('>');
  if (startTagEnd === -1) return [];
  const body = divBlockHtml.slice(startTagEnd + 1, divBlockHtml.length - 6); // remove outer </div>
  const result = [];
  const tagRe = /<div\b|<\/div>/gi;
  let depth = 0;
  let childStart = -1;
  let m;
  while ((m = tagRe.exec(body)) !== null) {
    if (m[0].toLowerCase() === '<div') {
      if (depth === 0) childStart = tagRe.lastIndex - 4; // position of '<div'
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && childStart !== -1) {
        const childEnd = tagRe.lastIndex;
        result.push(body.slice(childStart, childEnd));
        childStart = -1;
      }
    }
  }
  return result;
}

function extractTimesFromPrayersDom(html) {
  // Use DOMParser to query the structure precisely
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const container = doc.querySelector('div.prayers');
  if (!container) return {};
  const result = {};
  const children = Array.from(container.children);
  for (const child of children) {
    const nameEl = child.querySelector('.name');
    const timeEl = child.querySelector('.time > div') || child.querySelector('.time');
    if (!nameEl || !timeEl) continue;
    const key = labelToKey(nameEl.textContent || '');
    const timeRaw = (timeEl.textContent || '').trim();
    if (!key || !timeRaw) continue;
    try {
      result[key] = normalizeTo24h(timeRaw);
    } catch (_e) {
      // ignore invalid time strings
    }
  }
  // If names were not detected, fallback to order mapping
  if (Object.keys(result).length < 5) {
    const order = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
    const times = children
      .map(ch => ((ch.querySelector('.time > div') || ch.querySelector('.time'))?.textContent || '').trim())
      .filter(Boolean);
    for (let i = 0; i < Math.min(order.length, times.length); i++) {
      if (!result[order[i]]) {
        try { result[order[i]] = normalizeTo24h(times[i]); } catch (_e) {}
      }
    }
  }
  return result;
}

function extractTimesFromPrayersItems(html) {
  // Match each child block of .prayers with structure: name, time > div, wait
  // We don't rely on extracting the outer container first to avoid mismatched tags; we let the regex be global on the whole HTML
  const itemRe = /<div[^>]*class=["'][^"']*\bprayers\b[^"']*["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*(?:prayer-highlighted|\s)[^"']*["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>\s*<div[^>]*>\s*([0-2]?\d:[0-5]\d(?:\s?(?:AM|PM))?)\s*<\/div>\s*<\/div>[\s\S]*?<div[^>]*class=["'][^"']*\bwait\b[^"']*["'][^>]*>[\s\S]*?<\/div>[\s\S]*?<\/div>/gi;
  const looseItemRe = /<div[^>]*class=["'][^"']*\bprayers\b[^"']*["'][^>]*>[\s\S]*?<div[^>]*>[\s\S]*?<div[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>\s*<div[^>]*>\s*([0-2]?\d:[0-5]\d(?:\s?(?:AM|PM))?)\s*<\/div>\s*<\/div>[\s\S]*?<div[^>]*class=["'][^"']*\bwait\b[^"']*["'][^>]*>[\s\S]*?<\/div>[\s\S]*?<\/div>/gi;
  const result = {};
  let m;
  // Try stricter first
  while ((m = itemRe.exec(html)) !== null) {
    const key = labelToKey(m[1]);
    const t = m[2];
    if (key && !result[key]) result[key] = normalizeTo24h(t);
    if (Object.keys(result).length >= 5) return result;
  }
  // Fallback to looser child div blocks
  while ((m = looseItemRe.exec(html)) !== null) {
    const key = labelToKey(m[1]);
    const t = m[2];
    if (key && !result[key]) result[key] = normalizeTo24h(t);
    if (Object.keys(result).length >= 5) return result;
  }
  return result;
}

function extractTimesByNameThenTime(html) {
  const result = {};
  const names = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
  const lower = html.toLowerCase();
  for (const name of names) {
    const nameRe = new RegExp(`<div[^>]*class=["'][^"']*\\bname\\b[^"']*["'][^>]*>\\s*${name}\\s*<\\/div>`, 'i');
    const m = html.match(nameRe);
    if (!m) continue;
    const after = html.slice((m.index ?? 0) + m[0].length);
    const timeRe = /<div[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>[\s\S]*?<div[^>]*>\s*([0-2]?\d:[0-5]\d(?:\s?(?:AM|PM))?)\s*<\/div>[\s\S]*?<\/div>/i;
    const tm = after.match(timeRe);
    if (tm && tm[1]) {
      try { result[name] = normalizeTo24h(tm[1]); } catch (_e) {}
    }
  }
  return result;
}

function extractMosqueIdAndSlug(mosqueUrl, html) {
  const url = new URL(mosqueUrl);
  const slug = url.pathname.replace(/^\/+|\/+$/g, "");
  let id = null;
  const m = html.match(/\bID\s*(\d{2,})\b/i);
  if (m) id = m[1];
  return { id, slug };
}

async function tryFetchTimesFromKnownApis(mosqueUrl, html) {
  const { id, slug } = extractMosqueIdAndSlug(mosqueUrl, html);
  const base = `${new URL(mosqueUrl).origin}`;

  const endpoints = [];
  if (slug) endpoints.push(`${base}/${slug}.json`);
  if (id) {
    endpoints.push(
      `${base}/api/mosque-times/${id}`,
      `${base}/api/v2/mosque/${id}/times`,
      `${base}/api/v1/mosque/${id}`,
      `${base}/api/v1/mosques/${id}`,
      `${base}/api/v4/mosque/${id}/times`
    );
  }

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { credentials: "omit", cache: "no-store" });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // Try to parse text as JSON if mislabelled
        const t = await res.text();
        try {
          const json = JSON.parse(t);
          const parsed = extractTimesFromPossiblyNestedJson(json);
          if (parsed && Object.keys(parsed).length >= 3) return parsed;
        } catch (_e2) { /* not json */ }
        continue;
      }
      const json = await res.json();
      const parsed = extractTimesFromPossiblyNestedJson(json);
      if (parsed && Object.keys(parsed).length >= 3) return parsed;
    } catch (_e) {
      // continue
    }
  }
  return null;
}

function extractTimesFromPossiblyNestedJson(json) {
  const result = {};
  const labelMap = {
    Fajr: ["fajr", "subh"],
    Dhuhr: ["dhuhr", "duhr", "zuhr", "zuhur", "dohr"],
    Asr: ["asr"],
    Maghrib: ["maghrib", "maghreb"],
    Isha: ["isha", "ichaa", "ishaa"],
  };
  const timePattern = /^\s*([0-2]?\d:[0-5]\d)(?:\s?(AM|PM))?\s*$/i;

  function visit(node) {
    if (node && typeof node === 'object') {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === 'string' && timePattern.test(v)) {
          const kl = k.toLowerCase();
          for (const [pray, keys] of Object.entries(labelMap)) {
            if (keys.some(s => kl.includes(s))) {
              if (!result[pray]) result[pray] = normalizeTo24h(v);
            }
          }
        } else {
          visit(v);
        }
      }
    }
  }
  visit(json);
  return result;
}

function normalizeTo24h(timeStr) {
  const s = timeStr.trim();
  const ampm = /\b(AM|PM)\b/i.exec(s);
  let [h, m] = s.replace(/\b(AM|PM)\b/ig, "").trim().split(":").map((n) => parseInt(n, 10));
  if (isNaN(h) || isNaN(m)) throw new Error(`Bad time: ${timeStr}`);
  if (ampm) {
    const isPM = ampm[1].toUpperCase() === "PM";
    if (h === 12) h = isPM ? 12 : 0; else if (isPM) h += 12;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getTodayLocalIsoDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function toNextOccurrenceToday(timeHHMM, minutesBefore = 0) {
  const [h, m] = timeHHMM.split(":").map((n) => parseInt(n, 10));
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (minutesBefore > 0) target.setMinutes(target.getMinutes() - minutesBefore);
  if (target <= now) return null; // already past
  return target;
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ settings: DEFAULT_SETTINGS }, (res) => {
      resolve(res.settings || DEFAULT_SETTINGS);
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings }, resolve);
  });
}

async function saveTimes(dateIso, times) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [`times:${dateIso}`]: times }, resolve);
  });
}

async function loadTimes(dateIso) {
  return new Promise((resolve) => {
    chrome.storage.local.get([`times:${dateIso}`], (res) => {
      resolve(res[`times:${dateIso}`] || null);
    });
  });
}

async function scheduleAlarmsForToday(times, settings) {
  const prayersOrder = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  for (const p of prayersOrder) {
    if (!settings.notifyFor[p] || !times[p]) continue;
    const t = toNextOccurrenceToday(times[p], settings.minutesBefore || 0);
    const alarmName = `prayer:${p}`;
    // clear any existing
    await chrome.alarms.clear(alarmName);
    if (!t) continue;
    await chrome.alarms.create(alarmName, { when: t.getTime() });
  }

  // Daily refresh alarm at configured hour
  const nextRefresh = computeNextLocalHour(settings.refreshHourLocal || 3);
  await chrome.alarms.clear("refreshTimes");
  await chrome.alarms.create("refreshTimes", { when: nextRefresh.getTime() });
}

function computeNextLocalHour(hour) {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
}

async function refreshAndSchedule() {
  const settings = await loadSettings();
  try {
    const times = await fetchPrayerTimesByPosition(settings.latitude, settings.longitude, settings.calcMethod);
    const today = getTodayLocalIsoDate();
    await saveTimes(today, times);
    await scheduleAlarmsForToday(times, settings);
  } catch (e) {
    console.warn("Mawaqit: failed to refresh times", e);
  }
}

async function ensureTodayScheduled() {
  const settings = await loadSettings();
  const today = getTodayLocalIsoDate();
  let times = await loadTimes(today);
  if (!times) {
    await refreshAndSchedule();
  } else {
    await scheduleAlarmsForToday(times, settings);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureTodayScheduled();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureTodayScheduled();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "refreshTimes") {
    await refreshAndSchedule();
    return;
  }
  if (alarm.name.startsWith("prayer:")) {
    const prayer = alarm.name.split(":")[1];
    const today = getTodayLocalIsoDate();
    const times = await loadTimes(today);
    const timeLabel = times && times[prayer] ? times[prayer] : "now";
    chrome.notifications.create(undefined, {
      type: "basic",
      iconUrl: ICON_DATA_URL,
      title: `${prayer} time`,
      message: `It's time for ${prayer} (${timeLabel}).`
    });

    // After a prayer alarm fires, we don't reschedule it today. Others remain.
  }
});

// Listen to settings changes from options page to reschedule
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === "settingsUpdated") {
      await ensureTodayScheduled();
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === "popupRefreshTimes") {
      const settings = await loadSettings();
      try {
        const today = getTodayLocalIsoDate();
        let times = await loadTimes(today);
        if (!times) {
          times = await fetchPrayerTimesByPosition(settings.latitude, settings.longitude, settings.calcMethod);
          await saveTimes(today, times);
        }
        sendResponse({ ok: true, times });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }
  })();
  return true;
});

// Tiny 1x1 PNG used as notification icon to avoid bundling assets
const ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";


