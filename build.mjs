// ─────────────────────────────────────────────────────────────────────
// INQUIRIES · builds the site from the answers in answers/
//
// Every .md file in answers/ is one answered question. It starts with the
// question as a quote (a line beginning with ">"), and everything after
// the quote is the answer:
//
//   ---
//   by: marrow
//   ---
//   > What first drew you to Jung rather than Freud?
//
//   Freud gave me a map of the cellar…
//
// `by:` is the name the asker left; leave it empty and they show as
// "anonymous". `draft: true` keeps an answer off the site.
//
// An answer's date comes from (in order): a `date:` line in its
// frontmatter, a timestamp at the start of its file name (Obsidian's
// "Unique note creator" makes names like 202610031432), or the moment it
// was first committed to git.
//
//   npm run build   → writes the site to public/
//   npm run serve   → builds, then previews at http://localhost:8080
// ─────────────────────────────────────────────────────────────────────

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { marked } from "marked"

const SITE = {
  name: "INQUIRIES",
  // answers on each page of the feed
  perPage: 10,
  // the row of links beneath the subtitle: [label, address]
  nav: [
    ["home", "https://abyssata.blog"],
    ["garden", "https://wiki.abyssata.blog"],
    ["miscellany", "https://misc.abyssata.blog"],
    ["diary", "https://diary.abyssata.blog"],
    ["inquiries", "https://ask.abyssata.blog"],
  ],
  // GoatCounter site code (abyssata.goatcounter.com), shared with the garden; "" turns counting off
  goatcounter: "abyssata",
  // shown beneath the name; HTML is fine
  subtitle: 'questions sent to <a href="https://abyssata.blog">Abyssata</a>, and her answers.',
  description: "Questions sent to Abyssata, and her answers.",
  url: "https://ask.abyssata.blog",
  timeZone: "America/New_York",

  // ── The ask box ──
  // Questions are sent by Web3Forms (web3forms.com) to the inbox the key
  // was made for. The key is safe to publish: it can only send to you.
  web3formsKey: "0f231d3e-2ec6-4a82-9c61-17716646b4a8",
  // the subject line of the email each question arrives in
  emailSubject: "A new inquiry",
  // the words around the ask box
  askHeading: "Ask me anything",
  askPlaceholder: "a question, a provocation, a stray curiosity…",
  namePlaceholder: "a name, if you’d like to leave one",
  askNote: "Questions reach me privately. The ones I answer are kept here.",
  thanks: "Received, with thanks. If I answer, it will appear here.",
}

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const ANSWERS = path.join(ROOT, "answers")
const OUT = path.join(ROOT, "public")

// a fingerprint of each file, added to its address so browsers fetch the
// new one as soon as it changes instead of reusing an old saved copy
const fingerprint = (f) => createHash("sha1").update(fs.readFileSync(path.join(ROOT, "site", f))).digest("hex").slice(0, 8)
const CSS_VERSION = fingerprint("style.css")
const JS_VERSION = fingerprint("site.js")

marked.use({ breaks: true, gfm: true })

// ── Reading answers ─────────────────────────────────────────────────

function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { data: {}, body: src }
  const data = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) data[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "").trim()
  }
  return { data, body: src.slice(m[0].length) }
}

// The offset of the site's time zone from UTC at a given moment, in ms
function zoneOffset(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SITE.timeZone,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return asUtc - utcMs
}

// A wall-clock time in the site's time zone → a real Date
function localTime(y, mo, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - zoneOffset(guess - zoneOffset(guess)))
}

function parseStamp(s) {
  const m = String(s).match(/^(\d{4})-?(\d{2})-?(\d{2})(?:[ T_-]?(\d{2}):?(\d{2}))?/)
  return m ? localTime(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : null
}

function firstCommitted(file) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%cI", "--", file], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const last = out.split("\n").filter(Boolean).pop()
    return last ? new Date(last) : null
  } catch {
    return null
  }
}

function answerDate(file, data) {
  if (data.date) {
    const explicit = /[zZ]|[+-]\d{2}:?\d{2}$/.test(data.date) ? new Date(data.date) : parseStamp(data.date)
    if (explicit && !isNaN(explicit)) return explicit
  }
  return parseStamp(path.basename(file)) ?? firstCommitted(file) ?? fs.statSync(file).mtime
}

const slugify = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "inquiry"

// Every file under answers/ that isn't a note, by name, so ![[image.png]] finds it
function indexAttachments() {
  const found = new Map()
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (!e.name.endsWith(".md")) found.set(e.name, path.relative(ANSWERS, p))
    }
  }
  walk(ANSWERS)
  return found
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// Obsidian's own syntax, turned into plain Markdown/HTML before rendering
function obsidianToMarkdown(body, attachments) {
  // leave code alone
  return body.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((chunk, i) => {
    if (i % 2) return chunk
    return chunk
      // ![[image.png]] or ![[image.png|300]]
      .replace(/!\[\[([^\]|]+?)(?:\|(\d+)(?:x(\d+))?)?\]\]/g, (_, name, w) => {
        const rel = attachments.get(name.trim()) ?? name.trim()
        const src = "/" + rel.split(path.sep).map(encodeURIComponent).join("/")
        return `<img src="${src}" alt=""${w ? ` width="${w}"` : ""} loading="lazy">`
      })
      // [[note|shown text]] and [[note]] become plain text
      .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target)
      // ==highlight==
      .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
      // %% comments %% stay private
      .replace(/%%[\s\S]*?%%/g, "")
  }).join("")
}

// The question is the quote the note opens with; the rest is the answer.
// (A `question:` line in the frontmatter works too.)
function splitQuestion(body, data) {
  const lines = body.replace(/^\s*\n/, "").split(/\r?\n/)
  const quote = []
  while (lines.length && /^\s*>/.test(lines[0])) quote.push(lines.shift().replace(/^\s*>\s?/, ""))
  const question = quote.length ? quote.join("\n").trim() : (data.question ?? "").trim()
  return { question, answer: (quote.length ? lines.join("\n") : body).trim() }
}

function readAnswers() {
  if (!fs.existsSync(ANSWERS)) return []
  const attachments = indexAttachments()
  const seen = new Set()
  return fs.readdirSync(ANSWERS)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .map((f) => {
      const file = path.join(ANSWERS, f)
      const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"))
      if (String(data.draft).toLowerCase() === "true") return null
      const { question, answer } = splitQuestion(obsidianToMarkdown(body, attachments), data)
      if (!question || !answer) {
        console.warn(`Skipped ${f}: it needs a question (a line starting with ">") and an answer beneath it.`)
        return null
      }
      const date = answerDate(file, data)
      const plainQ = question.replace(/[*_`\[\]=]/g, "").replace(/\s+/g, " ").trim()
      let slug = slugify(data.slug ?? plainQ)
      while (seen.has(slug)) slug += "-2"
      seen.add(slug)
      return {
        slug,
        date,
        by: data.by || "",
        plainQ,
        questionHtml: marked.parse(question),
        answerHtml: marked.parse(answer),
        text: `${plainQ} ${answer}`,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date)
}

// ── Writing the site ────────────────────────────────────────────────

const fmt = (d, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: SITE.timeZone, ...opts }).format(d)
// "3 Oct 2026"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayOf = (d) => `${fmt(d, { day: "numeric" })} ${MONTHS[+fmt(d, { month: "numeric" }) - 1]} ${fmt(d, { year: "numeric" })}`

// the circumpunct from the garden, as the tab icon
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 112 112"><circle cx="50" cy="50" r="44" fill="none" stroke="#5c2229" stroke-width="8"/><circle cx="50" cy="50" r="9" fill="#5c2229"/></svg>',
  )

// the magnifier beside the search line
const MAGNIFIER =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 15a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM13.2 13.2 18 18" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>'

function page({ title, body, canonical, description = SITE.description, pager = "", bodyClass = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE.url}${canonical}">
<link rel="icon" href="${ICON}">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.name)}" href="/feed.xml">
<link rel="stylesheet" href="/style.css?v=${CSS_VERSION}">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
<header class="masthead">
  <h1 class="name"><a href="/">${escapeHtml(SITE.name)}</a></h1>
  <p class="subtitle">${SITE.subtitle}</p>
  <nav class="sites" aria-label="Elsewhere">${SITE.nav.map(([label, href]) => `<a href="${href}"${href.replace(/\/$/, "") === SITE.url.replace(/\/$/, "") ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`).join('<span class="sep" aria-hidden="true">·</span>')}</nav>
</header>
<main>
${body}
</main>
<footer>
  <div class="foot">
    <label class="search"><input id="search" type="search" placeholder="search" aria-label="Search the answers" autocomplete="off" spellcheck="false">${MAGNIFIER}</label>
    <nav class="pager" id="pager">${pager}</nav>
  </div>
</footer>
<script src="/site.js?v=${JS_VERSION}" defer></script>${SITE.goatcounter ? `
<script>window.goatcounter = { path: (p) => location.host + p }</script>
<script data-goatcounter="https://${SITE.goatcounter}.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>` : ""}
</body>
</html>
`
}

// The ask box. Sent in the background by site.js (the page stays put and
// thanks the reader); without scripts, the form posts and Web3Forms brings
// the reader back to /sent/.
function askBox() {
  return `<form class="ask" id="ask" action="https://api.web3forms.com/submit" method="POST" data-thanks="${escapeHtml(SITE.thanks)}">
  <input type="hidden" name="access_key" value="${escapeHtml(SITE.web3formsKey)}">
  <input type="hidden" name="subject" value="${escapeHtml(SITE.emailSubject)}">
  <input type="hidden" name="from_name" value="${escapeHtml(SITE.name)}">
  <input type="hidden" name="redirect" value="${SITE.url}/sent/">
  <input type="checkbox" name="botcheck" class="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label class="ask-label" for="question">${escapeHtml(SITE.askHeading)}</label>
  <textarea id="question" name="question" rows="4" maxlength="2000" required placeholder="${escapeHtml(SITE.askPlaceholder)}"></textarea>
  <div class="ask-row">
    <input type="text" name="name" maxlength="80" autocomplete="off" aria-label="Your name (optional)" placeholder="${escapeHtml(SITE.namePlaceholder)}">
    <button type="submit">Send</button>
  </div>
  <p class="ask-note" aria-live="polite">${escapeHtml(SITE.askNote)}</p>
</form>`
}

const thanksBox = (again) =>
  `<div class="ask sent"><p class="sent-mark" aria-hidden="true">☉</p><p class="sent-text">${escapeHtml(SITE.thanks)}</p>${again}</div>`

// one question and its answer
function inquiryHtml(q, { single = false } = {}) {
  const who = q.by ? escapeHtml(q.by) : "anonymous"
  const when = `<time datetime="${q.date.toISOString()}">${dayOf(q.date)}</time>`
  return `<article class="inquiry" id="${q.slug}">
  <div class="question">${q.questionHtml}</div>
  <p class="who"><span class="by">${who}</span><span class="dot" aria-hidden="true">·</span>${single ? when : `<a href="/q/${q.slug}/">${when}</a>`}</p>
  <div class="answer">
${q.answerHtml}  </div>
</article>`
}

const excerpt = (s, n = 150) => s.replace(/\s+/g, " ").trim().slice(0, n)

function write(rel, content) {
  const f = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, content)
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue
    const a = path.join(from, e.name), b = path.join(to, e.name)
    if (e.isDirectory()) copyDir(a, b)
    else if (!e.name.endsWith(".md")) {
      fs.mkdirSync(to, { recursive: true })
      fs.copyFileSync(a, b)
    }
  }
}

function build() {
  if (!SITE.web3formsKey) console.warn("No Web3Forms key yet: the ask box won't send until web3formsKey is filled in (build.mjs, top).")
  const all = readAnswers()
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  // the feed: the ask box, then SITE.perPage answers to a page: /, /page/2/ …
  const pages = Math.max(1, Math.ceil(all.length / SITE.perPage))
  const pageUrl = (n) => (n === 1 ? "/" : `/page/${n}/`)
  for (let n = 1; n <= pages; n++) {
    const these = all.slice((n - 1) * SITE.perPage, n * SITE.perPage)
    const pager =
      (n > 1 ? `<a href="${pageUrl(n - 1)}" rel="prev">← Newer</a>` : "") +
      (n < pages ? `<a href="${pageUrl(n + 1)}" rel="next">Older →</a>` : "")
    write(n === 1 ? "index.html" : `page/${n}/index.html`, page({
      title: n === 1 ? SITE.name : `Page ${n} · ${SITE.name}`,
      canonical: pageUrl(n),
      pager,
      body:
        (n === 1 ? askBox() + "\n" : "") +
        (these.length
          ? `<div class="feed">\n${these.map((q) => inquiryHtml(q)).join("\n")}\n</div>`
          : `<p class="empty">No answers yet.</p>`),
    }))
  }

  // everything the search line needs, in one file
  const plain = (html) =>
    html.replace(/<[^>]+>/g, " ").replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e])
      .replace(/\s+/g, " ").trim()
  write("search.json", JSON.stringify(all.map((q) => ({
    html: inquiryHtml(q),
    text: plain(q.questionHtml + " " + (q.by || "anonymous") + " " + q.answerHtml),
  }))))

  // one page per answer
  for (const q of all) {
    write(`q/${q.slug}/index.html`, page({
      title: `${excerpt(q.plainQ, 70)} · ${SITE.name}`,
      canonical: `/q/${q.slug}/`,
      description: excerpt(plain(q.answerHtml)),
      bodyClass: "single",
      body: inquiryHtml(q, { single: true }) + `\n<p class="back"><a href="/">All inquiries</a><span class="sep" aria-hidden="true">·</span><a href="/#ask">Ask another</a></p>`,
    }))
  }

  // where readers land after sending, if their browser runs no scripts
  write("sent/index.html", page({
    title: `Received · ${SITE.name}`,
    canonical: "/sent/",
    body: thanksBox(`<p class="back"><a href="/">Back to the inquiries</a></p>`),
  }))

  // RSS
  write("feed.xml", `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
<channel>
<title>${escapeHtml(SITE.name)}</title>
<link>${SITE.url}/</link>
<description>${escapeHtml(SITE.description)}</description>
${all.slice(0, 50).map((q) => `<item>
  <title>${escapeHtml(excerpt(q.plainQ, 100))}</title>
  <link>${SITE.url}/q/${q.slug}/</link>
  <guid>${SITE.url}/q/${q.slug}/</guid>
  <pubDate>${q.date.toUTCString()}</pubDate>
  <description>${escapeHtml(q.questionHtml + q.answerHtml)}</description>
</item>`).join("\n")}
</channel>
</rss>
`)

  write("404.html", page({ title: `Not found · ${SITE.name}`, canonical: "/404.html", body: `<p class="empty">Nothing here. <a href="/">Back to the inquiries</a>.</p>` }))

  copyDir(path.join(ROOT, "site"), OUT) // style.css, site.js, fonts, CNAME
  copyDir(ANSWERS, OUT) // images and other attachments, at the same paths
  console.log(`Built ${all.length} answer${all.length === 1 ? "" : "s"} → public/`)
}

build()
