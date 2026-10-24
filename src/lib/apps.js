import apps from '../data/apps.json';
import failedOnly from '../data/failed.json';
import labelPRs from '../data/prs.json';

// apps: every label with version history. allTitles adds the failing labels the
// tracker has never resolved (versions is empty for those); Browse and the title
// pages use allTitles, everything built on versions uses apps.
const allTitles = [...apps, ...failedOnly].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

export { apps, allTitles };

// Labels with open Installomator pull requests, most recently updated first.
// Labels a PR adds have no title page yet (hasPage is false).
const lastPRUpdate = (entry) => entry.pullRequests.reduce((max, pr) => (pr.updatedAt > max ? pr.updatedAt : max), '');
const sortedPRs = labelPRs
  .map((entry) => ({ ...entry, updatedAt: lastPRUpdate(entry) }))
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const prsByLabel = new Map(sortedPRs.map((entry) => [entry.label, entry]));

export { sortedPRs as labelPRs };

// The open pull requests touching a label, or undefined.
export const openPRsFor = (label) => prsByLabel.get(label);

export const prHref = (label) => `/prs/${label}/`;

// What a PR does to the label file. The tracker uses GitHub's changeType spelling.
const CHANGES = {
  ADDED: { key: 'added', text: 'New label' },
  MODIFIED: { key: 'modified', text: 'Label update' },
  CHANGED: { key: 'modified', text: 'Label update' },
  RENAMED: { key: 'renamed', text: 'Renamed label' },
  COPIED: { key: 'added', text: 'New label' },
  DELETED: { key: 'deleted', text: 'Label removal' },
};
export const changeOf = (pr) => CHANGES[pr.labelChange?.changeType] ?? { key: 'modified', text: 'Label change' };

// A PR's review state, with the chip class that colors it. A draft isn't ready
// for review, so that wins over the review decision.
export function reviewOf(pr) {
  if (pr.isDraft) return { key: 'draft', text: 'Draft', chip: 'plain' };
  switch (pr.reviewDecision) {
    case 'APPROVED': return { key: 'approved', text: 'Approved', chip: 'new' };
    case 'CHANGES_REQUESTED': return { key: 'changes', text: 'Changes requested', chip: 'warn' };
    case 'REVIEW_REQUIRED': return { key: 'review', text: 'Review required', chip: '' };
    default: return { key: 'none', text: 'No review decision', chip: 'plain' };
  }
}

// Reviewers whose latest review approves the PR. Installomator wants more than
// one, so a PR can have approvals and still need review.
export const approvalsOf = (pr) => pr.reviews.filter((r) => r.state === 'APPROVED').length;

// One reviewer's latest review.
export const reviewStateText = (state) =>
  ({ APPROVED: 'Approved', CHANGES_REQUESTED: 'Changes requested', COMMENTED: 'Commented', DISMISSED: 'Dismissed' })[state] ?? state;

// CI checks on the PR's head commit; null when the PR has no checks.
export function checksOf(pr) {
  switch (pr.checksState) {
    case 'SUCCESS': return { text: 'Checks passing', chip: 'new' };
    case 'FAILURE': case 'ERROR': return { text: 'Checks failing', chip: 'warn' };
    case 'PENDING': case 'EXPECTED': return { text: 'Checks running', chip: 'plain' };
    default: return null;
  }
}

// Labels that don't set appNewVersion have no version to track, so the tracker
// skips them. They're recorded as failing but shown as skipped.
export const isSkipped = (app) => app.failing?.reason === 'label does not set appNewVersion';

// 'working', 'failing' or 'skipped'.
export const statusOf = (app) => (!app.failing ? 'working' : isSkipped(app) ? 'skipped' : 'failing');

// How many entries the "Recently updated" list on the home page shows.
export const RECENT_COUNT = 100;

export const SOURCES = {
  tracker: 'https://github.com/gilburns/Installomator-Tracker',
  metadata: 'https://github.com/gilburns/Installomator-Metadata',
  installomator: 'https://github.com/Installomator/Installomator',
  installomatorPRs: 'https://github.com/Installomator/Installomator/pulls',
};

// Original files in Installomator-Metadata, served with CORS so the page can save them.
const METADATA_RAW = 'https://raw.githubusercontent.com/gilburns/Installomator-Metadata/main';
export const metadataPlistUrl = (label) => `${METADATA_RAW}/Metadata/${encodeURIComponent(label)}.plist`;
export const metadataIconUrl = (label) => `${METADATA_RAW}/Icons/${encodeURIComponent(label)}.png`;

// The label's source in Installomator, opened on GitHub rather than downloaded.
export const labelSourceUrl = (label) =>
  `${SOURCES.installomator}/blob/main/fragments/labels/${encodeURIComponent(label)}.sh`;

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
