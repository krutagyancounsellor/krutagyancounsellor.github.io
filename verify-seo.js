// One-off verification of the generated site. Safe to delete after running:
//   node verify-seo.js
const fs = require("fs");
const path = require("path");

const pages = [
  "public/index.html",
  "public/blog/index.html",
  "public/blog/anxiety-grounding/index.html",
  "public/404.html",
];

const LINK_RE = /href=["']([^"']*(?:wa\.me|mailto:|tel:|instagram\.com|facebook\.com|linkedin\.com|x\.com)[^"']*)["']/gi;
const LD_RE = /<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g;
const OLD_FORM = /docs\.google\.com\/forms/i;

let problems = [];

for (const p of pages) {
  if (!fs.existsSync(p)) {
    problems.push(`MISSING FILE: ${p}`);
    continue;
  }
  const html = fs.readFileSync(p, "utf8");

  // 1. Every page has a meta description and canonical URL.
  //    Minified output drops attribute quotes, so match both forms.
  if (!/<meta[ >][^>]*name=["']?description/.test(html)) problems.push(`${p}: no meta description`);
  if (!/<link[ >][^>]*rel=["']?canonical/.test(html)) problems.push(`${p}: no canonical URL`);
  if (!/<meta[ >][^>]*property=["']?og:image/.test(html)) problems.push(`${p}: no og:image`);
  if (!/<meta[ >][^>]*name=["']?twitter:card/.test(html)) problems.push(`${p}: no twitter:card`);

  // 2. Exactly one <h1> per page.
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) problems.push(`${p}: found ${h1s} <h1> elements (expected 1)`);

  // 3. No leftover Google Forms links.
  if (OLD_FORM.test(html)) problems.push(`${p}: still links to the old Google Form`);

  // 4. All JSON-LD blocks parse.
  let count = 0;
  for (const m of html.matchAll(LD_RE)) {
    count++;
    try {
      JSON.parse(m[1]);
    } catch (e) {
      problems.push(`${p}: invalid JSON-LD block #${count} — ${e.message}`);
    }
  }
  if (count === 0) problems.push(`${p}: no JSON-LD found`);

  // 5. External links must carry rel="noopener".
  for (const m of html.matchAll(/<a\b[^>]*target=_blank[^>]*>/gi)) {
    if (!/rel=[^>]*noopener/.test(m[0])) {
      problems.push(`${p}: target=_blank without rel=noopener → ${m[0].slice(0, 80)}`);
    }
  }
}

// 6. Contact links present on the homepage and in the footer.
const home = fs.readFileSync("public/index.html", "utf8");
for (const expected of [
  "wa.me/919632871524",
  "mailto:krutagyancounsellor@gmail.com",
  "tel:919632871524",
  "https://www.instagram.com/krutagyancounsellor/",
  "https://www.facebook.com/krutagyancounsellor",
  "https://www.linkedin.com/in/madhuchhanda-padhy-61944a320",
  "https://x.com/krutagyanc",
]) {
  if (!home.includes(expected)) problems.push(`homepage missing link: ${expected}`);
}

// 7. The FAQ page was removed: no /faq/ link in the nav, the footer, or
//    anywhere in the page. The FAQ content now lives on the homepage only.
const nav = home.split("</nav>")[0];
if (/\/faq\//.test(nav)) problems.push("FAQ link still present in the main navigation");
if (/\/faq\//.test(home)) problems.push("homepage still links to the removed /faq/ page");

// 7b. FAQPage structured data now lives on the homepage.
if (!/FAQPage/.test(home)) problems.push("FAQPage schema missing from the homepage");
if (!/Do I need to know what I want to discuss/.test(home)) {
  problems.push("homepage FAQ accordion is missing its questions");
}

// 8. robots.txt references the sitemap.
const robots = fs.readFileSync("public/robots.txt", "utf8");
if (!/Sitemap: https:\/\/krutagyancounsellor\.github\.io\/sitemap\.xml/.test(robots)) {
  problems.push("robots.txt does not reference the sitemap");
}

// 9. Bootstrap Icons actually compiled into the published stylesheet.
//    It is published to public/css/ by resources.FromString's target path.
const iconCss = (() => {
  const dir = "public/css";
  if (!fs.existsSync(dir)) return null;
  return fs
    .readdirSync(dir)
    .find((f) => f.startsWith("bootstrap-icons.") && f.endsWith(".css"));
})();
if (!iconCss) {
  problems.push("bootstrap-icons stylesheet was not published to public/css/");
} else {
  const icons = fs.readFileSync(path.join("public/css", iconCss), "utf8");
  if (!icons.includes("bi-whatsapp")) problems.push("bi-whatsapp class missing from icons CSS");
  if (!icons.includes("@font-face")) problems.push("icon @font-face missing from icons CSS");
  if (!icons.includes("/fonts/bootstrap-icons.woff2")) {
    problems.push("icon font url() was not rewritten to /fonts/");
  }
}

// 10. Icon font files are published and reachable from the root.
for (const f of ["bootstrap-icons.woff2", "bootstrap-icons.woff"]) {
  if (!fs.existsSync(path.join("public/fonts", f))) problems.push(`missing published font: ${f}`);
}

console.log("Pages checked:", pages.length);
if (problems.length === 0) {
  console.log("\n✅ ALL CHECKS PASSED");
} else {
  console.log(`\n❌ ${problems.length} PROBLEM(S):`);
  problems.forEach((p) => console.log("  -", p));
  process.exitCode = 1;
}
