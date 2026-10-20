// Render the wiki checkout into a static site for GitHub Pages.
//
// The wiki is a git repo of Markdown; GitHub serves it under a *flat*
// URL namespace, so `guides/Create-a-temporary-workspace.md` is linked
// as `[…](Create-a-temporary-workspace)`. This build flattens to match:
// every page is written to the site root under its own basename, which
// is what makes those links resolve. A collision between two files of
// the same basename is a build error rather than a silent overwrite.
//
// `_Sidebar.md` and `_Footer.md` are GitHub's wiki chrome, not pages:
// they become the nav column and the footer on every page.
//
// Links that leave the wiki: a relative link that climbs out of it
// (`../issues`) points into the repository, as it does on GitHub, and
// is written out as an absolute URL there. Every link that leaves the
// site (those, and any absolute http(s) link) opens a tab of its own:
// the site is also shown inside a frame, and most sites, github.com
// included, refuse to be framed.

import {readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, statSync} from 'node:fs';
import {join, basename, extname, relative} from 'node:path';
import {marked} from 'marked';

const SRC = process.argv[2] ?? 'wiki';
const OUT = process.argv[3] ?? 'site';

/** Every markdown file in the checkout, git metadata aside. */
const walk = (dir) => readdirSync(dir).flatMap((name) => {
	if('.git' === name) return [];
	const path = join(dir, name);
	return statSync(path).isDirectory() ? walk(path) : [path];
});

const files = walk(SRC);
const pages = files.filter(p => '.md' === extname(p).toLowerCase());

// `Home` is the site index; the chrome files are not pages of their own
const chrome = new Set(['_Sidebar.md', '_Footer.md']);
const slug_of = (path) => basename(path, extname(path));

// flat namespace, so a duplicate basename would silently lose a page
const seen = new Map();
for(const path of pages) {
	if(chrome.has(basename(path))) continue;
	const slug = slug_of(path);
	if(seen.has(slug)) throw new Error(`two wiki pages share the name "${slug}": ${seen.get(slug)} and ${path}`);
	seen.set(slug, path);
}

const read = (name) => {
	const hit = pages.find(p => basename(p) === name);
	return hit ? readFileSync(hit, 'utf8') : '';
};

/** The host the wiki lives on, and its repository there (GitHub Actions names both; a local build falls back to this one). */
const SERVER = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const REPOSITORY = `${SERVER}/${process.env.GITHUB_REPOSITORY ?? 'planetaryutilities/kotar-support'}`;

/**
 * Where a link of the wiki points on the site, and whether it leaves it.
 *
 * - `Page-Name` (a wiki link, no extension) becomes `Page-Name.html`.
 * - `../issues` climbs out of the wiki into its repository: GitHub
 *   serves the wiki under `<repository>/wiki/`, so that is the
 *   repository's issue list. Every leading `../` reads the same way, so
 *   `../../issues`, which resolves past the repository on GitHub (a
 *   404 there), lands on the issues too.
 * - `/path` is a path on GitHub itself.
 */
const href_of = (href) => {
	// an anchor on the same page stays
	if(href.startsWith('#')) return [href, false];

	// climbs out of the wiki: into its repository
	const up = /^(?:\.\.\/)+(.*)$/.exec(href);
	if(up) return [`${REPOSITORY}/${up[1]}`, true];

	// absolute or protocol-relative: as written, and only http(s) leaves the site (mailto: and the like open what they open)
	if(/^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(href)) return [href, /^(?:https?:)?\/\//i.test(href)];

	// root-relative: a path on GitHub
	if(href.startsWith('/')) return [`${SERVER}${href}`, true];

	// split off the query and fragment
	const [, target, tail] = /^([^#?]*)(.*)$/.exec(href);

	// an asset (an image, a PDF) keeps its path; only pages gain .html
	if(!target || extname(target)) return [href, false];

	// flat namespace: a link may carry a directory that the output drops
	return [`${basename(target)}.html${tail}`, false];
};

/** Rewrites every link of the rendered HTML; one that leaves the site opens a new tab. */
const link_rewrite = (html) => html.replace(/<a\s([^>]*)>/gi, (whole, attributes) => {
	const href = /\bhref="([^"]*)"/i.exec(attributes);
	if(!href) return whole;

	const [target, leaves] = href_of(href[1]);
	let out = attributes.replace(href[0], `href="${target}"`);

	// a tab of its own, unless the page already chose one
	if(leaves && !/\btarget=/i.test(out)) out += ' target="_blank" rel="noopener noreferrer"';
	return `<a ${out}>`;
});

const render = async (md) => link_rewrite(await marked.parse(md, {async:true}));

const sidebar = await render(read('_Sidebar.md'));
const footer = await render(read('_Footer.md'));

const shell = (title, body) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="wiki.css">
</head><body>
<div class="layout">
<nav class="sidebar">${sidebar}</nav>
<main class="content">${body}${footer ? `<footer>${footer}</footer>` : ''}</main>
</div>
</body></html>
`;

mkdirSync(OUT, {recursive:true});

let count = 0;
for(const [slug, path] of seen) {
	const html = shell(slug.replace(/-/g, ' '), await render(readFileSync(path, 'utf8')));
	writeFileSync(join(OUT, `${slug}.html`), html);

	// GitHub's wiki lands on Home; so does the site
	if('Home' === slug) writeFileSync(join(OUT, 'index.html'), html);
	count += 1;
}

// Assets ride along at the same relative paths the Markdown references
// (`<img src="images/…">`). Only non-Markdown files: the pages are
// rendered above, and copying their sources would publish the raw
// Markdown beside the HTML.
for(const path of files) {
	if('.md' === extname(path).toLowerCase()) continue;
	const rel = relative(SRC, path);
	mkdirSync(join(OUT, rel, '..'), {recursive:true});
	cpSync(path, join(OUT, rel));
}

writeFileSync(join(OUT, 'wiki.css'), readFileSync(new URL('./wiki.css', import.meta.url), 'utf8'));
console.log(`built ${count} pages into ${OUT}/`);
