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

// Where the wiki lives, for links that point outside it. Actions sets
// GITHUB_REPOSITORY; the fallback keeps a local build honest.
const REPO = process.env.GITHUB_REPOSITORY ?? 'planetaryutilities/kotar-support';

// Every wiki page sits at the same depth (`/OWNER/REPO/wiki/<Page>`), so
// a `../`-style link resolves the same from any of them.
const WIKI_BASE = `https://github.com/${REPO}/wiki/Home`;

/**
 * A wiki link (`Page-Name`, no extension) becomes `Page-Name.html`.
 *
 * A link that walks out of the wiki (`../../issues/new/choose`) is not a
 * page: on GitHub the browser resolves it against the wiki URL, so it is
 * resolved the same way here and emitted absolute. Treating it as a page
 * produced `choose.html`, a 404 on the published site.
 */
const link_rewrite = (html) => html.replace(
	/href="([^"#?:]+)((?:[#?][^"]*)?)"/g,
	(whole, target, tail) => {
		// absolute, protocol-relative and anchors are left alone
		if(/^(?:[a-z][a-z\d+\-.]*:|\/\/|#)/i.test(target)) return whole;

		// out of the wiki: resolve exactly as a browser would on GitHub, so
		// the published site follows the same link the wiki does
		if(target.startsWith('/') || target.split('/').includes('..')) {
			return `href="${new URL(target, WIKI_BASE).href}${tail}"`;
		}

		// an asset (an image, a PDF) keeps its path; only pages gain .html
		if(extname(target)) return whole;

		// flat namespace: a link may carry a directory that the output drops
		return `href="${basename(target)}.html${tail}"`;
	}
);

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
