// ─────────────────────────────────────────────────────────────────────
// Two small things in the browser:
//  · The ask box sends its question in the background, then thanks the
//    reader in its place (no page change).
//  · The search line at the foot shows every answer (not just this
//    page's) containing the words, tinted. Esc or clearing it restores
//    the page. The answers come from /search.json, which build.mjs writes.
// ─────────────────────────────────────────────────────────────────────
;(() => {
  // ── The ask box ──
  const form = document.getElementById("ask")
  if (form && window.fetch) {
    const note = form.querySelector(".ask-note")
    const button = form.querySelector("button")
    const noteText = note.textContent
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const data = new FormData(form)
      if (!String(data.get("question") || "").trim()) return
      data.delete("redirect")
      button.disabled = true
      button.textContent = "Sending"
      note.textContent = noteText
      note.classList.remove("error")
      try {
        const r = await fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(Object.fromEntries(data)),
        })
        const out = await r.json().catch(() => ({}))
        if (!r.ok || out.success === false) throw new Error(out.message || "failed")
        const thanks = document.createElement("div")
        thanks.className = "ask sent"
        thanks.innerHTML =
          '<p class="sent-mark" aria-hidden="true">☉</p>' +
          '<p class="sent-text"></p>' +
          '<p class="back"><a href="/" class="again">Ask another</a></p>'
        thanks.querySelector(".sent-text").textContent = form.dataset.thanks || "Received, with thanks."
        thanks.setAttribute("role", "status")
        thanks.querySelector(".again").addEventListener("click", (ev) => {
          ev.preventDefault()
          form.reset()
          button.disabled = false
          button.textContent = "Send"
          thanks.replaceWith(form)
          form.querySelector("textarea").focus()
        })
        form.replaceWith(thanks)
      } catch {
        button.disabled = false
        button.textContent = "Send"
        note.textContent = "It didn’t go through. Please try again in a moment."
        note.classList.add("error")
      }
    })
  }

  // ── Search ──
  const input = document.getElementById("search")
  const main = document.querySelector("main")
  const pager = document.getElementById("pager")
  if (!input || !main || !pager) return

  // keep the page's own nodes (so the ask box keeps working after a search)
  const original = { nodes: [...main.childNodes], pager: pager.innerHTML, single: document.body.classList.contains("single") }
  let items = null
  let loading = null
  const load = () =>
    (loading ??= fetch("/search.json")
      .then((r) => r.json())
      .then((d) => (items = d))
      .catch(() => (loading = null)))

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

  // tint the words wherever they appear in the text (never inside tags)
  function tint(html, q) {
    const t = document.createElement("template")
    t.innerHTML = html
    const walk = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT)
    const texts = []
    while (walk.nextNode()) texts.push(walk.currentNode)
    const needle = q.toLowerCase()
    for (const node of texts) {
      const s = node.nodeValue
      const low = s.toLowerCase()
      let i = low.indexOf(needle)
      if (i < 0) continue
      const frag = document.createDocumentFragment()
      let last = 0
      while (i >= 0) {
        frag.append(s.slice(last, i))
        const mark = document.createElement("mark")
        mark.className = "hit"
        mark.textContent = s.slice(i, i + needle.length)
        frag.append(mark)
        last = i + needle.length
        i = low.indexOf(needle, last)
      }
      frag.append(s.slice(last))
      node.replaceWith(frag)
    }
    return t.innerHTML
  }

  function restore() {
    main.replaceChildren(...original.nodes)
    pager.innerHTML = original.pager
    document.body.classList.toggle("single", original.single)
  }

  function show() {
    const q = input.value.trim()
    if (!q) return restore()
    if (!items) return
    const hits = items.filter((n) => n.text.toLowerCase().includes(q.toLowerCase()))
    main.innerHTML =
      `<p class="found">${
        hits.length ? `${hits.length} answer${hits.length === 1 ? "" : "s"} with “${esc(q)}”` : `Nothing with “${esc(q)}”.`
      }</p>` + (hits.length ? `<div class="feed">${hits.map((n) => tint(n.html, q)).join("")}</div>` : "")
    pager.innerHTML = `<a href="/">All inquiries</a>`
    document.body.classList.remove("single")
  }

  input.addEventListener("focus", load)
  input.addEventListener("input", () => (items ? show() : load().then(show)))
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = ""
      restore()
    }
  })
})()
