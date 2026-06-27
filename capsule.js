// wiki-capsule — shared capsule helpers for the Visual Plugin Family.
//
// Imported (and bundled by esbuild) into wiki-plugin-mermaid, wiki-plugin-diagram,
// and wiki-plugin-timeline. Covers the two cross-plugin concerns:
//   1. Auto-linking diagram nodes to wiki pages (clickable capsules).
//   2. Freezing a rendered diagram into a portable client-side ghost capsule page.
//
// Browser-only (uses DOM / window.wiki). Pure helpers (norm, buildPageIndex) are
// also unit-testable in node.

// ── Kroki client (Render Broker) ──────────────────────────────────────────────
// Local-first, public fallback. Used by the Mermaid and Diagram plugins.
// Local Kroki reached by name via Caddy (kroki.localhost → port 4246), so the
// Hitchhiker port policy can move Kroki without ever touching this. Public
// kroki.io is the fallback. See localhost "Hitchhiker Ports".
export const DEFAULT_ENDPOINTS = ['http://render.localhost', 'https://kroki.io']

// Sanitise HTML inside foreignObject (Mermaid 11 uses it for node labels).
const sanitizeForeignObject = (fo) => {
  const toRemove = []
  const walk = (node) => {
    if (node.nodeType !== 1) return
    if (node.tagName.toLowerCase() === 'script') { toRemove.push(node); return }
    for (const attr of Array.from(node.attributes)) {
      if (/^on[a-z]/i.test(attr.name)) node.removeAttribute(attr.name)
    }
    Array.from(node.children).forEach(walk)
  }
  walk(fo)
  toRemove.forEach((n) => n.parentNode?.removeChild(n))
}

const STRIP_TAGS = new Set(['script', 'iframe', 'object', 'embed'])

// Parse + sanitise a Kroki SVG string into an SVG element scaled to the column.
// foreignObject is kept (Mermaid 11 labels) but its HTML is sanitised.
export const sanitizeSVG = (svgText) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  if (doc.querySelector('parsererror')) return null
  const svg = doc.documentElement
  if (svg.tagName.toLowerCase() !== 'svg') return null

  const walk = (el) => {
    const tag = el.tagName.toLowerCase().split(':').pop()
    if (STRIP_TAGS.has(tag)) { el.parentNode?.removeChild(el); return }
    if (tag === 'foreignobject') { sanitizeForeignObject(el); return }
    for (const attr of Array.from(el.attributes)) {
      if (/^on[a-z]/i.test(attr.name)) el.removeAttribute(attr.name)
      else if ((attr.name === 'href' || attr.name === 'xlink:href') &&
               /^(https?:)?\/\//i.test(attr.value) &&
               ['use', 'image', 'feimage'].includes(tag)) el.removeAttribute(attr.name)
    }
    Array.from(el.children).forEach(walk)
  }
  walk(svg)
  // Scale to column width; let height follow the viewBox aspect ratio so Kroki's
  // fixed height doesn't leave empty bands above/below the diagram.
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width'))
    const h = parseFloat(svg.getAttribute('height'))
    if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  svg.removeAttribute('height')
  svg.setAttribute('width', '100%')
  svg.style.display = 'block'
  svg.style.height = 'auto'
  return svg
}

// POST a diagram source to Kroki, trying endpoints in order. Returns {svg, endpoint}.
export const fetchKroki = async (type, source, endpoints = DEFAULT_ENDPOINTS) => {
  let lastError
  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/${type}/svg`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: source,
      })
      if (!res.ok) { lastError = `${base}: HTTP ${res.status}`; continue }
      return { svg: await res.text(), endpoint: base }
    } catch (e) {
      lastError = `${base}: ${e.message}`
    }
  }
  throw new Error(lastError || 'No Kroki endpoint available')
}

// ── Auto-link nodes to wiki pages ─────────────────────────────────────────────
export const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

export const buildPageIndex = (list) => {
  const m = new Map()
  for (const p of list || []) {
    if (p.title) m.set(norm(p.title), p.title)
    if (p.slug) m.set(p.slug.toLowerCase(), p.title || p.slug)
  }
  return m
}

let pageIndexPromise = null
export const getPageIndex = (fetchImpl) => {
  if (pageIndexPromise) return pageIndexPromise
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
  if (!f) return Promise.resolve(new Map())
  pageIndexPromise = f('/system/sitemap.json')
    .then((r) => r.json())
    .then(buildPageIndex)
    .catch(() => new Map())
  return pageIndexPromise
}

export const nodeLabel = (nodeEl) => {
  const lbl = nodeEl.querySelector('.nodeLabel')
  if (lbl && lbl.textContent.trim()) return lbl.textContent.trim()
  return Array.from(nodeEl.querySelectorAll('text')).map((t) => t.textContent).join(' ').trim()
}

// Annotate any node whose label matches an existing wiki page with the declarative
// open-page affordance the plugins' click handlers (and the SVG Plugin) understand.
export const linkifyNodes = (svgEl, index) => {
  if (!svgEl || !index || !index.size) return 0
  let linked = 0
  svgEl.querySelectorAll('g.node').forEach((node) => {
    if (node.hasAttribute('data-fedwiki-action')) return
    const page = index.get(norm(nodeLabel(node)))
    if (!page) return
    node.setAttribute('data-fedwiki-action', 'open-page')
    node.setAttribute('data-fedwiki-page', page)
    node.style.cursor = 'pointer'
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title')
    t.textContent = `→ ${page}`
    node.appendChild(t)
    linked++
  })
  return linked
}

// ── Capsule interactions (click / fullscreen / edit) ──────────────────────────
// Dark overlay fullscreen view of an SVG, dismissed by click or Escape.
export const openFullscreen = (svgEl) => {
  const clone = svgEl.cloneNode(true)
  clone.style.cssText = 'width:90vw;height:90vh;max-width:1400px;object-fit:contain;'
  const overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:fixed;top:0;left:0;width:100vw;height:100vh;',
    'background:rgba(0,0,0,0.88);z-index:10000;',
    'display:flex;align-items:center;justify-content:center;cursor:zoom-out;',
  ].join('')
  overlay.appendChild(clone)
  document.body.appendChild(overlay)
  const close = () => overlay.remove()
  overlay.addEventListener('click', close)
  const esc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc) } }
  document.addEventListener('keydown', esc)
}

// Wire the standard capsule interactions on a rendered SVG container:
//   • click a node with data-fedwiki-action="open-page" → navigate (shift = new column)
//   • single click elsewhere → fullscreen (delayed so a double-click can cancel it)
//   • double click → open the wiki text editor
// `container` is the SVG holder; `$el` is the jQuery item; `item` is the story item.
export const attachCapsuleInteractions = (container, $el, item) => {
  let clickTimer = null
  container.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-fedwiki-action]')
    if (actionEl) {
      const action = actionEl.dataset.fedwikiAction
      const page = actionEl.dataset.fedwikiPage
      const site = actionEl.dataset.fedwikiSite || undefined
      if (action === 'open-page' && page) {
        e.stopPropagation()
        if (window.wiki && window.wiki.doInternalLink) {
          let $page = null
          try { $page = $el.closest('.page') } catch (_) {}
          window.wiki.doInternalLink(page, e.shiftKey ? null : $page, site || null)
        } else {
          const slug = page.toLowerCase().replace(/\s+/g, '-')
          window.open(site ? `http://${site}/${slug}.html` : `/${slug}.html`, '_blank')
        }
        return
      }
    }
    if (clickTimer) clearTimeout(clickTimer)
    clickTimer = setTimeout(() => {
      clickTimer = null
      const s = container.querySelector('svg')
      if (s) openFullscreen(s)
    }, 250)
  })
  $el.on('dblclick', (e) => {
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
    e.preventDefault()
    if (window.wiki && window.wiki.textEditor) window.wiki.textEditor($el, item)
  })
}

// ── Freeze to a client-side ghost capsule page ────────────────────────────────
// Publish the rendered diagram as a ghost page (no server): the SVG Plugin renders
// the picture and the original source travels alongside so the page stays editable.
// Persist with the wiki's native fork/keep. No item-type thaw.
export const deriveTitle = ($el) => {
  try {
    const t = $el.closest('.page').find('h1').text().trim()
    return t ? `${t} Capsule` : 'Diagram Capsule'
  } catch (_) { return 'Diagram Capsule' }
}

export const freezeToGhost = ($el, svgOrEl, authoringType, source) => {
  const wiki = window.wiki
  if (!wiki || !wiki.newPage || !wiki.showResult) return
  const svgText = typeof svgOrEl === 'string'
    ? svgOrEl
    : new XMLSerializer().serializeToString(svgOrEl)
  const page = wiki.newPage({ title: deriveTitle($el), story: [] })
  page.addItem({ type: 'svg', text: svgText })
  page.addItem({ type: 'markdown', text: '## Source' })
  page.addItem({ type: authoringType, text: source })
  let $src = null
  try { $src = $el.closest('.page') } catch (_) {}
  wiki.showResult(page, $src && $src.length ? { $page: $src } : {})
}
