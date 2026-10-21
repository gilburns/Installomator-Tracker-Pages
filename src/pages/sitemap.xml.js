import { allTitles, appHref, lastUpdated } from '../lib/apps.js';

const escapeXml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Title pages carry the date of their newest version; failing labels without
// history have none, so they're listed without lastmod.
export function GET({ site }) {
  const day = (iso) => iso?.slice(0, 10);
  const pages = [
    { path: '/', lastmod: day(lastUpdated()) },
    { path: '/browse/', lastmod: day(lastUpdated()) },
    ...allTitles.map((app) => ({ path: appHref(app.label), lastmod: day(app.versions[0]?.timeStamp) })),
  ];
  const urls = pages
    .map(({ path, lastmod }) => {
      const loc = `<loc>${escapeXml(new URL(path, site).href)}</loc>`;
      return `  <url>${loc}${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    })
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
