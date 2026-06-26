# @fortyfoxes/wiki-capsule

Shared browser helpers for the Federated Wiki **Visual Plugin Family**
([wiki-plugin-mermaid](https://github.com/Hitchhikers-Guide-to-the-Galaxy/wiki-plugin-mermaid),
[wiki-plugin-diagram](https://github.com/Hitchhikers-Guide-to-the-Galaxy/wiki-plugin-diagram),
[wiki-plugin-timeline](https://github.com/Hitchhikers-Guide-to-the-Galaxy/wiki-plugin-timeline)).

It is imported and **bundled** into each plugin at build time (esbuild), so the
published plugins stay self-contained. One place for the logic the plugins share.

## What it provides

- **Render broker / Kroki client** — `DEFAULT_ENDPOINTS`, `fetchKroki(type, source)`,
  `sanitizeSVG(text)` (strips scripts / event handlers / remote refs, sanitises
  `<foreignObject>` for Mermaid 11 labels, drops Kroki's fixed height so the SVG
  scales to column width).
- **Capsule affordances** — `getPageIndex()` / `buildPageIndex(list)`,
  `linkifyNodes(svg, index)` (annotate nodes that name a wiki page with
  `data-fedwiki-action="open-page"`), `openFullscreen(svg)`,
  `attachCapsuleInteractions(container, $el, item)` (click → navigate / fullscreen,
  double-click → edit).
- **Freeze** — `deriveTitle($el)`, `freezeToGhost($el, svgOrString, type, source)`
  — publish a rendered diagram as a client-side **ghost capsule page**: the SVG
  Plugin renders the picture and the original source travels alongside, so the page
  stays editable. Persist with the wiki's native fork/keep. No item-type thaw.

## Usage

```js
import { fetchKroki, sanitizeSVG, linkifyNodes, getPageIndex,
         attachCapsuleInteractions, freezeToGhost } from '@fortyfoxes/wiki-capsule'
```

Browser-only (uses the DOM and `window.wiki`). The pure helpers (`norm`,
`buildPageIndex`) are unit-testable under node.

## License

MIT
