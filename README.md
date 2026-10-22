# Third-Party-Patcher-Tracker

Source for [installomatortracker.org](https://installomatortracker.org): a searchable version history for every macOS title tracked through [Installomator](https://github.com/Installomator/Installomator) labels.

The site is static. It's rebuilt from two data repos and published with GitHub Pages:

- [Installomator-Tracker](https://github.com/gilburns/Installomator-Tracker): the version history in `TrackedLabelDetails/<label>.json`, and the labels it currently can't resolve in `failed_labels.json`, and the current status of every label in `label_status.csv`.
- [Installomator-Metadata](https://github.com/gilburns/Installomator-Metadata): the name, publisher, category, description, links and icon for each label.

## How it updates

`.github/workflows/deploy.yml` runs at 07:30 and 19:30 UTC (a little after each tracker run), on every push to `main`, on demand, and on a `data-updated` repository dispatch. It checks out both data repos, runs `scripts/build-data.mjs` to merge them and resize the icons, builds the site with [Astro](https://astro.build) and deploys it to Pages. Pull requests build the site but don't deploy.

## Pages

- `/` shows the most recent versions found, grouped by day (`RECENT_COUNT` in `src/lib/apps.js`).
- `/browse/` lists every title with search by name, publisher, keyword or label and filters for category, status (working, failing or skipped) and sort. Filters are kept in the URL, for example `/browse/?category=Web%20Browsers` or `/browse/?status=failing`.
- `/app/<label>/` shows one title's details and its full version history. Failing labels also show the failure reason, and labels that don't set `appNewVersion` are shown as skipped rather than failing; those the tracker has never resolved get a page with no version history. Signed download links that expire (CloudFront, S3, Google Cloud Storage, GitHub release assets, Akamai, CDN77, Oracle) are marked as expired or expiring.
- `/data/search.json` is a compact index of every title and its latest version.
- `/data/label_status.csv` is the tracker's current status of every label, linked from the footer for download.
- `/sitemap.xml` and `/llms.txt` are generated at build time and list the title pages and data files for crawlers and agents; `public/robots.txt` points to the sitemap.

## Building locally

Requires Node 22.12 or later.

```sh
git clone --filter=blob:none https://github.com/gilburns/Installomator-Tracker data-src/tracker
git clone --depth 1 https://github.com/gilburns/Installomator-Metadata data-src/metadata
npm ci
npm run data      # writes src/data/, public/data/ and public/icons/{96,256}/
npm run dev       # or: npm run build && npm run preview
```

Clone the tracker without `--depth 1` (for example with `--filter=blob:none`) to get "New title" badges and static-URL detection right; both use the history of `TrackedLabelDetails/`. A shallow clone still builds.

`TRACKER_DIR` and `METADATA_DIR` point the data script at existing checkouts instead of `data-src/`.
