#!/usr/bin/env node
// Merges Installomator-Tracker version history and failed labels with
// Installomator-Metadata plists/icons into the data the site is built from.
//
//   TRACKER_DIR   checkout of gilburns/Installomator-Tracker   (default: data-src/tracker)
//   METADATA_DIR  checkout of gilburns/Installomator-Metadata  (default: data-src/metadata)
//
// Writes:
//   src/data/apps.json          every tracked label, merged, versions newest first
//   src/data/failed.json        failing labels with no version history yet
//   public/data/search.json     compact index used by the in-browser search
//   public/data/label_status.csv  the tracker's current status of every label, copied as is
//   public/icons/{96,256}/<label>.webp  resized icons (skipped when already up to date)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as plist from 'plist';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const trackerDir = path.resolve(process.env.TRACKER_DIR ?? path.join(root, 'data-src/tracker'));
const metadataDir = path.resolve(process.env.METADATA_DIR ?? path.join(root, 'data-src/metadata'));
const ICON_SIZES = [96, 256];
const DAY_MS = 24 * 60 * 60 * 1000;

const exists = (p) => fs.access(p).then(() => true, () => false);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isUrl = (v) => /^https?:\/\//i.test(v);

async function readMetadata(label) {
  const file = path.join(metadataDir, 'Metadata', `${label}.plist`);
  if (!(await exists(file))) return null;
  try {
    return plist.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    console.warn(`warn: could not parse ${label}.plist: ${err.message}`);
    return null;
  }
}

async function buildIcon(label) {
  const src = path.join(metadataDir, 'Icons', `${label}.png`);
  if (!(await exists(src))) return false;
  const srcTime = (await fs.stat(src)).mtimeMs;
  for (const size of ICON_SIZES) {
    const out = path.join(root, 'public/icons', String(size), `${label}.webp`);
    if ((await exists(out)) && (await fs.stat(out)).mtimeMs >= srcTime) continue;
    try {
      await sharp(src).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 85 }).toFile(out);
    } catch (err) {
      console.warn(`warn: could not convert icon for ${label}: ${err.message}`);
      return false;
    }
  }
  return true;
}

// Signed download links that the vendor's server issued for one request and
// that stop working after a short time (CloudFront, S3, Google Cloud Storage,
// GitHub release assets, Akamai, CDN77, Oracle). Returns null for an ordinary
// link, otherwise { expires } with the expiry as ISO time, or '' when the link
// doesn't say.
const epoch = (s) => new Date(Number(s) * 1000).toISOString();
const amzTime = (date, seconds) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date ?? '');
  if (!m || !/^\d+$/.test(seconds ?? '')) return '';
  return new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]) + Number(seconds) * 1000).toISOString();
};
function signedUrl(url) {
  let q;
  try {
    // Some labels record the query with HTML-escaped ampersands.
    q = new URL(url.replace(/&amp;/g, '&')).searchParams;
  } catch {
    return null;
  }
  const p = new Map([...q].map(([k, v]) => [k.toLowerCase(), v]));
  const num = (v, re) => re.exec(v ?? '')?.[1];
  let expires;
  if (p.has('x-amz-signature')) expires = amzTime(p.get('x-amz-date'), p.get('x-amz-expires'));
  else if (p.has('x-goog-signature')) expires = amzTime(p.get('x-goog-date'), p.get('x-goog-expires'));
  else if (p.has('signature') && p.has('expires')) expires = num(p.get('expires'), /^(\d{9,})$/);
  else if (p.has('sig') && p.has('se')) expires = Number.isNaN(Date.parse(p.get('se'))) ? '' : new Date(p.get('se')).toISOString();
  else if (p.has('__token__') || p.has('hdnea')) expires = num(p.get('__token__') ?? p.get('hdnea'), /(?:^|~)exp=(\d{9,})/);
  else if (num(p.get('secure'), /,(\d{9,})$/)) expires = num(p.get('secure'), /,(\d{9,})$/);
  else if (num(p.get('authparam'), /^(\d{9,})_/)) expires = num(p.get('authparam'), /^(\d{9,})_/);
  else return null;
  if (expires && /^\d+$/.test(expires)) expires = epoch(expires);
  return { expires: expires || '' };
}

// Name, publisher, links and so on from a label's Installomator-Metadata plist.
function metadataFields(label, plistData, fallbackName) {
  const md = plistData ?? {};
  const links = {
    homepage: str(md.Homepage),
    documentation: str(md.Documentation),
    privacy: str(md.Privacy),
  };
  for (const k of Object.keys(links)) if (!isUrl(links[k])) delete links[k];
  return {
    label,
    name: str(md.AppName) || fallbackName || label,
    publisher: str(md.Publisher),
    category: str(md.Category) || 'Uncategorized',
    description: str(md.Description),
    keywords: str(md.Keywords).split(',').map((k) => k.trim()).filter(Boolean),
    bundleId: str(md.AppID),
    links,
    hasMetadata: Boolean(plistData),
  };
}

// Labels the tracker currently can't resolve, from failed_labels.json:
// label -> { reason, since }. "since" is when the current failure was first recorded.
async function readFailed() {
  const file = path.join(trackerDir, 'failed_labels.json');
  if (!(await exists(file))) {
    console.warn('warn: failed_labels.json not found; no labels will be shown as failing.');
    return new Map();
  }
  try {
    const { failed = {} } = JSON.parse(await fs.readFile(file, 'utf8'));
    return new Map(Object.entries(failed).map(([label, f]) => [label, {
      reason: str(f.reason) || 'unknown error',
      since: str(f.firstSeen),
    }]));
  } catch (err) {
    console.warn(`warn: could not read failed_labels.json: ${err.message}`);
    return new Map();
  }
}

// The tracker's label_status.csv, served from the site so the footer link downloads it.
async function copyLabelStatus() {
  const file = path.join(trackerDir, 'label_status.csv');
  const dest = path.join(root, 'public/data/label_status.csv');
  if (!(await exists(file))) {
    console.warn('warn: label_status.csv not found; the footer will not link to it.');
    await fs.rm(dest, { force: true });
    return;
  }
  await fs.copyFile(file, dest);
}

// Run an async fn over items with bounded concurrency.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

// When each TrackedLabelDetails/<label>.json was first committed, i.e. when the
// tracker first picked the title up. Needs the tracker checkout's full history;
// returns an empty map for a shallow clone or a non-git directory.
function trackedSinceDates() {
  const dates = new Map();
  try {
    const git = (...args) => execFileSync('git', ['-C', trackerDir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
      console.warn('warn: tracker checkout is shallow; "New title" falls back to each label\'s first entry.');
      return dates;
    }
    let date = '';
    for (const line of git('log', '--diff-filter=A', '--format=C %cI', '--name-only', '--', 'TrackedLabelDetails/').split('\n')) {
      if (line.startsWith('C ')) date = new Date(line.slice(2)).toISOString();
      else if (line.endsWith('.json')) {
        const label = path.basename(line, '.json');
        // Log is newest first; keep the earliest add in case a file was re-created.
        dates.set(label, date);
      }
    }
  } catch (err) {
    console.warn(`warn: could not read tracker history: ${err.message.split('\n')[0]}`);
  }
  return dates;
}

async function main() {
  const detailsDir = path.join(trackerDir, 'TrackedLabelDetails');
  if (!(await exists(detailsDir))) throw new Error(`Tracker data not found at ${detailsDir}`);
  if (!(await exists(path.join(metadataDir, 'Metadata')))) throw new Error(`Metadata not found at ${metadataDir}`);

  await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
  await fs.mkdir(path.join(root, 'public/data'), { recursive: true });
  for (const size of ICON_SIZES) await fs.mkdir(path.join(root, 'public/icons', String(size)), { recursive: true });

  const files = (await fs.readdir(detailsDir)).filter((f) => f.endsWith('.json')).sort();
  const trackedSince = trackedSinceDates();
  const failed = await readFailed();

  const apps = (await mapLimit(files, 8, async (file) => {
    const label = file.replace(/\.json$/, '');
    let history;
    try {
      history = JSON.parse(await fs.readFile(path.join(detailsDir, file), 'utf8'));
    } catch (err) {
      console.warn(`warn: skipping ${file}: ${err.message}`);
      return null;
    }
    if (!Array.isArray(history) || history.length === 0) return null;

    const plistData = await readMetadata(label);
    const hasIcon = await buildIcon(label);

    // Static-URL labels: the download link always serves the latest version.
    // The tracker now keeps every version for these but strips the links from
    // superseded entries. Before that change it overwrote the previous entry, so
    // an oldest entry well after the tracker first saw the label means earlier
    // versions were dropped that way. A single entry like that is still a
    // static-URL label; with more entries the label has since moved to
    // version-specific links.
    const since = trackedSince.get(label) ?? '';
    const oldest = str(history[0].timeStamp);
    const historyReplaced = Boolean(since && oldest && Date.parse(oldest) - Date.parse(since) > 2 * DAY_MS);
    const staticUrl = history.slice(0, -1).some((e) => !str(e.downloadURL)) || (historyReplaced && history.length === 1);

    // Tracker files are oldest to newest; the site wants newest first.
    const versions = history.map((e, i) => {
      const signed = signedUrl(str(e.downloadURL)) ?? signedUrl(str(e.downloadURLi386));
      return {
        version: str(e.appNewVersion),
        timeStamp: str(e.timeStamp),
        type: str(e.type),
        downloadURL: str(e.downloadURL),
        downloadURLi386: str(e.downloadURLi386) || undefined,
        teamID: str(e.expectedTeamID),
        firstSeen: i === 0 && !historyReplaced,
        // Expiry of a signed, short-lived download link ('' when unknown).
        signedUntil: signed ? signed.expires : undefined,
      };
    }).reverse();

    const latest = history[history.length - 1];
    return {
      ...metadataFields(label, plistData, str(latest.name)),
      hasIcon,
      failing: failed.get(label),
      staticUrl,
      historyReplaced,
      trackedSince: since,
      blockingProcesses: Array.isArray(latest.blockingProcesses) ? latest.blockingProcesses : [],
      versions,
    };
  })).filter(Boolean);

  apps.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  await fs.writeFile(path.join(root, 'src/data/apps.json'), JSON.stringify(apps));

  // Failing labels the tracker has never resolved: no versions, but they still
  // get a card and a title page so the reason is visible.
  const tracked = new Set(apps.map((a) => a.label));
  const failedOnly = await mapLimit([...failed.keys()].filter((l) => !tracked.has(l)).sort(), 8, async (label) => ({
    ...metadataFields(label, await readMetadata(label)),
    hasIcon: await buildIcon(label),
    failing: failed.get(label),
    versions: [],
  }));
  failedOnly.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  await fs.writeFile(path.join(root, 'src/data/failed.json'), JSON.stringify(failedOnly));

  const search = apps.map((a) => ({
    l: a.label,
    n: a.name,
    p: a.publisher,
    c: a.category,
    k: a.keywords.join(' '),
    v: a.versions[0].version,
    u: a.versions[0].timeStamp,
    i: a.hasIcon ? 1 : 0,
  }));
  await fs.writeFile(path.join(root, 'public/data/search.json'), JSON.stringify(search));
  await copyLabelStatus();

  const withMeta = apps.filter((a) => a.description).length;
  const withIcon = apps.filter((a) => a.hasIcon).length;
  const entries = apps.reduce((n, a) => n + a.versions.length, 0);
  const staticCount = apps.filter((a) => a.staticUrl).length;
  const failingTracked = apps.filter((a) => a.failing).length;
  const signedCount = apps.filter((a) => a.versions.some((v) => v.signedUntil !== undefined)).length;
  console.log(`Built ${apps.length} titles, ${entries} versions (${withMeta} with metadata, ${withIcon} with icons, ${staticCount} with a static download URL, ${signedCount} with expiring signed links).`);
  console.log(`${failed.size} failing labels: ${failingTracked} with version history, ${failedOnly.length} without.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
