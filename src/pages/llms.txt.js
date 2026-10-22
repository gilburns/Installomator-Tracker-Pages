import fs from 'node:fs';
import { SOURCES, allTitles, lastUpdated } from '../lib/apps.js';

// A Markdown summary of the site for language models (https://llmstxt.org).
export function GET({ site }) {
  const url = (path) => new URL(path, site).href;
  const hasLabelStatus = fs.existsSync('public/data/label_status.csv');
  const body = `# Installomator Version Tracker

> Version history for ${allTitles.length.toLocaleString('en-US')} macOS apps tracked through [Installomator](${SOURCES.installomator}) labels. Every label is run twice a day on a GitHub Actions Mac, and each new version found is recorded with its download URL, Apple team ID and the time it was first seen. Data last changed ${lastUpdated().slice(0, 10)}.

Each title is identified by its Installomator label (for example \`googlechrome\`). A label is working when the tracker resolves a version, failing when it can't, and skipped when the label doesn't set \`appNewVersion\`, so there's no version to track. Some vendors issue short-lived signed download links, and those links stop working after they expire.

## Pages

- [Recent updates](${url('/')}): the newest versions found, grouped by day
- [Browse](${url('/browse/')}): every title, with search and filters. Filters can be set in the URL with \`q\`, \`category\`, \`publisher\`, \`status\` (\`working\`, \`failing\` or \`skipped\`) and \`sort=updated\`, for example ${url('/browse/?status=failing')}
- Title pages at \`${url('/app/')}<label>/\`: the app's publisher, category, description and links, its status, and its full version history with download URLs and team IDs

## Data

- [search.json](${url('/data/search.json')}): every title with version history and its latest version. Keys: \`l\` label, \`n\` name, \`p\` publisher, \`c\` category, \`k\` keywords, \`v\` latest version, \`u\` when it was first seen (UTC), \`i\` 1 if the title has an icon${hasLabelStatus ? `
- [label_status.csv](${url('/data/label_status.csv')}): the tracker's current status of every label` : ''}
- [Sitemap](${url('/sitemap.xml')}): every page on the site

## Sources

- [Installomator-Tracker](${SOURCES.tracker}): the version history, one JSON file per label in \`TrackedLabelDetails/\`
- [Installomator-Metadata](${SOURCES.metadata}): each app's name, publisher, category, description, links and icon
- [Installomator](${SOURCES.installomator}): the labels themselves
`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
