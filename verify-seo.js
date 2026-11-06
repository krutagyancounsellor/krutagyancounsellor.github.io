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

// 5b. Every page title ends with the brand suffix, exactly once.
//     Hugo's paginator aliases (`/blog/page/1/`) are redirect stubs
//     whose <title> is the target URL — they are not produced by
//     head-seo.html, so they are skipped.
const allHtml = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith(".html")) allHtml.push(full);
  }
})("public");

for (const p of allHtml) {
  const html = fs.readFileSync(p, "utf8");
  const tm = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!tm) {
    problems.push(`${p}: no <title> tag`);
    continue;
  }
  const t = tm[1].trim();
  // Hugo's paginator aliases (`/blog/page/1/`) are redirect stubs whose
  // <title> is the target URL — they are not produced by head-seo.html.
  if (/^https?:\/\//.test(t)) continue;
  if (!t.endsWith("| KrutagyanCounsellor")) {
    problems.push(`${p}: <title> does not end with the brand suffix → "${t}"`);
  }
  if ((t.match(/KrutagyanCounsellor/gi) || []).length > 1) {
    problems.push(`${p}: <title> repeats the brand name → "${t}"`);
  }
  if (/Krutagyan Counsellor/.test(t)) {
    problems.push(`${p}: <title> uses the spaced brand name → "${t}"`);
  }
  if (/^KrutagyanCounsellor\s*\|/.test(t)) {
    problems.push(`${p}: <title> starts with the brand name → "${t}"`);
  }
}

// 6. Contact links present on the homepage and in the footer.
//    Note: no `tel:` link is expected — the site deliberately offers a
//    WhatsApp booking link only, with no dial-to-call option.
const home = fs.readFileSync("public/index.html", "utf8");
for (const expected of [
  "wa.me/919632871524",
  "mailto:krutagyancounsellor@gmail.com",
  "https://www.instagram.com/krutagyancounsellor/",
  "https://www.facebook.com/krutagyancounsellor",
  "https://www.linkedin.com/in/madhuchhanda-padhy-61944a320",
  "https://x.com/krutagyanc",
]) {
  if (!home.includes(expected)) problems.push(`homepage missing link: ${expected}`);
}
if (/tel:/i.test(home)) {
  problems.push("homepage contains a tel: link (no dial-to-call option is wanted)");
}

// 7. The FAQ page was removed: no /faq/ link in the nav, the footer, or
//    anywhere in the page.
const nav = home.split("</nav>")[0];
if (/\/faq\//.test(nav)) problems.push("FAQ link still present in the main navigation");
if (/\/faq\//.test(home)) problems.push("homepage still links to the removed /faq/ page");

// 7b. The homepage FAQ accordion and its FAQPage structured data have both
//     been removed, so neither should be present in the output.
if (/FAQPage/.test(home)) problems.push("FAQPage schema still present on the homepage");
if (/Do I need to know what I want to discuss/.test(home)) {
  problems.push("homepage FAQ accordion is still present");
}

// 7c. The homepage must publish the session fee and the crisis notice.
if (!/₹800 to ₹2,000/.test(home)) {
  problems.push("homepage is missing the session fee");
}
if (!/If you need urgent help/.test(home)) {
  problems.push("homepage is missing the crisis / urgent-help notice");
}

// 7d. The hero must carry the Instagram call-to-action, and it must point at
//     the same URL as the footer icon and the `sameAs` structured data.
const IG_URL = "https://www.instagram.com/krutagyancounsellor/";

if (!/class="[^"]*hero-instagram-cta/.test(home)) {
  problems.push("homepage hero is missing the Instagram CTA button");
}
if (!/Connect on Instagram/.test(home)) {
  problems.push("homepage hero is missing the Instagram CTA label");
}
// The two hero buttons must always be on separate lines: the wrapper is a
// `d-grid` (no `d-sm-flex`), so the Instagram button wraps below the
// WhatsApp button at every breakpoint.
const heroBtnWrap = (home.match(/<div\b[^>]*d-grid[^>]*>(?:(?!<\/div>)[\s\S])*hero-instagram-cta/i) || [])[0] || "";
if (!/hero-instagram-cta/.test(heroBtnWrap)) {
  problems.push("hero Instagram button is not inside the stacked button grid");
}
if (/d-sm-flex/.test(heroBtnWrap)) {
  problems.push("hero buttons are not always stacked (found d-sm-flex)");
}

// Hugo's minifier strips attribute quotes, so accept both href="URL" and
// href=URL when matching.
// 7e. The consultant photo must be visible on every screen size. It is
//     rendered twice: once in the right-hand column (desktop only) and once
//     inline after the subtitle (mobile only). The mobile copy must NOT be
//     wrapped in `d-none`, otherwise it disappears on phones — which is the
//     regression this check guards against.
const heroPhotoWrap = (home.match(/<div\b[^>]*hero-photo-wrap[^>]*>/i) || [])[0] || "";
if (!heroPhotoWrap) {
  problems.push("homepage hero is missing the mobile consultant photo wrapper");
} else {
  if (/\bd-none\b/.test(heroPhotoWrap)) {
    problems.push("the mobile consultant photo is hidden (found d-none on hero-photo-wrap)");
  }
  if (!/\bd-lg-none\b/.test(heroPhotoWrap)) {
    problems.push("the mobile consultant photo is not limited to small screens (found no d-lg-none)");
  }
}
// The desktop copy must still be hidden below the `lg` breakpoint so the two
// copies never render side by side.
const heroDesktopPhoto = (home.match(/<div\b[^>]*d-none[^>]*d-lg-block[^>]*>/i) || [])[0] || "";
if (!heroDesktopPhoto) {
  problems.push("homepage hero is missing the desktop consultant photo column");
}
// The visible copy must be marked as the LCP element.
if (!/fetchpriority=("|')?high/.test(home)) {
  problems.push("the hero consultant photo is missing fetchpriority=high");
}

const igHref = "href=[\"\u0027]?" + IG_URL.replace(/[.*+?^${}()|[\]\\]/g, (m) => "\\" + m);

// The hero button itself must link to the Instagram profile.
const heroIgAnchor = (home.match(/<a\b[^>]*hero-instagram-cta[^>]*>/i) || [])[0] || "";
if (!heroIgAnchor) {
  problems.push("homepage hero is missing the Instagram CTA anchor");
} else if (!new RegExp(igHref).test(heroIgAnchor)) {
  problems.push("hero Instagram CTA does not point at " + IG_URL);
}

// The footer icon must link to the same URL. The Bootstrap icon sits inside
// the anchor, so match the anchor that immediately precedes a `bi-instagram`
// element.
const footerIgAnchor = (home.slice(home.indexOf("<footer")).match(/<a\b[^>]*>(?:<(?!\/a)[^>]*>)*(?:<i|<svg)[^>]*bi-instagram/i) || [])[0] || "";
if (!footerIgAnchor) {
  problems.push("footer is missing the Instagram icon link");
} else if (!new RegExp(igHref).test(footerIgAnchor)) {
  problems.push("footer Instagram icon does not point at " + IG_URL);
}

// The URL must also appear in the JSON-LD `sameAs` list.
if (!/instagram\.com\/krutagyancounsellor/.test(home)) {
  problems.push("Instagram URL is missing from the homepage structured data");
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
