import apps from '../data/apps.json';
import failedOnly from '../data/failed.json';

// apps: every label with version history. allTitles adds the failing labels the
// tracker has never resolved (versions is empty for those); Browse and the title
// pages use allTitles, everything built on versions uses apps.
const allTitles = [...apps, ...failedOnly].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

export { apps, allTitles };

// How many entries the "Recently updated" list on the home page shows.
export const RECENT_COUNT = 100;

export const SOURCES = {
  tracker: 'https://github.com/gilburns/Installomator-Tracker',
  metadata: 'https://github.com/gilburns/Installomator-Metadata',
  installomator: 'https://github.com/Installomator/Installomator',
};

// Original files in Installomator-Metadata, served with CORS so the page can save them.
const METADATA_RAW = 'https://raw.githubusercontent.com/gilburns/Installomator-Metadata/main';
export const metadataPlistUrl = (label) => `${METADATA_RAW}/Metadata/${encodeURIComponent(label)}.plist`;
export const metadataIconUrl = (label) => `${METADATA_RAW}/Icons/${encodeURIComponent(label)}.png`;

export const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);

export const iconSrc = (app, size = 96) =>
  app.hasIcon ? `/icons/${size}/${app.label}.webp` : '/icons/placeholder.svg';

export const appHref = (label) => `/app/${label}/`;

const dateFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '');
export const formatDay = (iso) => (iso ? dayFmt.format(new Date(iso)) : '');

// Every recorded version across all titles, newest first.
export function recentReleases(limit = RECENT_COUNT) {
  return apps
    .flatMap((app) => app.versions.map((v) => ({ app, ...v })))
    .filter((r) => r.timeStamp)
    .sort((a, b) => b.timeStamp.localeCompare(a.timeStamp))
    .slice(0, limit);
}

export function categories() {
  const counts = new Map();
  for (const a of allTitles) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

export const lastUpdated = () =>
  apps.reduce((max, a) => (a.versions[0].timeStamp > max ? a.versions[0].timeStamp : max), '');
