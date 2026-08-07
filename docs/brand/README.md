# Brand assets

| File | Purpose |
| --- | --- |
| `concept-a-terminal.svg` | Logo — heartbeat pulse in a terminal window (the shipped mark) |
| `concept-b-aura.svg`, `concept-c-pixel.svg` | Unused logo explorations, kept for reference |
| `social-preview.png` | 1280×640 social card — GitHub Social Preview. Same image as `site/public/og.png` (the site's `og:image`); keep the two files identical when updating. |

Palette: bg `#121014`, panel `#17161A`, accent magenta `#E24FD8`, monospace type.
Positioning line used on all external surfaces:
**"storepulse CLI — App Store Connect + Google Play release monitor"**.

## GitHub Social Preview upload (manual, once per image change)

1. Open <https://github.com/dioKR/storepulse> → **Settings** → **General**.
2. Scroll to **Social preview** → **Edit** → upload `docs/brand/social-preview.png`.
3. Verify with a share debugger (e.g. <https://www.opengraph.xyz/> or the
   [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)) using the repo URL —
   title, description and the 1280×640 image should all render.

## Search Console checklist (site SEO)

1. Verify ownership of the property in
   [Google Search Console](https://search.google.com/search-console)
   (URL-prefix property `https://diokr.github.io/storepulse/`).
2. **Sitemaps** → submit `https://diokr.github.io/storepulse/sitemap.xml`
   (10 URLs: 5 languages × home/tutorial).
3. After a few days, check **Pages** (indexing) — all 10 URLs should be
   discovered; canonical/hreflang issues would surface here.
4. Re-submit the sitemap only when pages are added or removed
   (`site/public/sitemap.xml` is maintained by hand).
