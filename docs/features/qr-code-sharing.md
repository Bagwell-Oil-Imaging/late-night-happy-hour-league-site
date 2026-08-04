---
feature: QR Code Sharing
number: 25
source-paths:
  - src/components/QRCodeModal.tsx
  - src/components/Header.tsx
---

## Intent
Lets any visitor pull up a scannable QR code for the site URL, from anywhere on the public site, to hand off the link in person (e.g. at a lanes night) without typing it.

## Key Behaviors
- "QR Code" option in the hamburger dropdown menu (above the divider from Bylaws) opens `QRCodeModal`
- Modal generates a QR code for the production site URL with Copy Image (Clipboard API) and Download (PNG) actions
- Escape key or clicking the overlay closes the modal; opening the menu item also closes the dropdown

## Conditional Paths
- If the browser lacks Clipboard API / `ClipboardItem` support (or the write is rejected), the Copy Image button shows a transient "Copy failed" state instead of throwing; Download still works via a plain data-URL anchor regardless

## External Dependencies
- `qrcode` npm package (client-side QR generation, no network call)
- Clipboard API (`navigator.clipboard.write` + `ClipboardItem`) for the Copy Image action; not used by Download

## Known Issues
None

## Notes
Modal state (`showQrCode`) is lifted to `App.tsx`, same pattern as `BylawsModal` and `AnnouncementsModal` — `QRCodeModal` renders once at the app shell level, and `Header` just calls `onOpenQrCode()`.

`QRCodeModal` intentionally hardcodes the production URL (`https://late-night-happy-hour-league-site.vercel.app/`) rather than reading `window.location.origin`, so a code generated while testing locally (or on a preview deploy) still points visitors at the real site. The QR image itself is always rendered black-on-white regardless of the site's dark theme, since low-contrast QR modules can fail to scan reliably.

Previously this trigger lived inside `OffSeasonLanding`'s countdown card (see [Home Dashboard](home-dashboard.md)) and its icon-only button crowded the "Countdown to Week 1: MM/DD/YYYY" title, causing it to wrap on narrow screens. Moving it into the hamburger menu also makes it available in-season, not just during the off-season landing view.
