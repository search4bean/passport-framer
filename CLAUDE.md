# CLAUDE.md — Passport Photo Framer

Context for anyone (human or agent) picking this up. Read before editing.

## What this is

A single-page tool for producing US passport photos. It measures the head in a
photo, decides whether a compliant 2×2 in crop is geometrically possible, and if
so emits a 600×600 crop plus a 6×4 in sheet with six copies at 300 dpi.

Everything runs client-side. No server, no upload, no analytics. The photos are
of a family member, so keeping them on-device is a hard requirement, not a nicety.

Deploy target: GitHub Pages at `search4bean/passport-framer`, served from `main`
at root. Repo must stay public — Pages on the free plan won't serve a private one.

## The geometry — do not change these without reading this section

On a 2×2 photo the US State Department requires:

- head 1″–1⅜″ chin to crown (50%–68.75% of the frame)
- eyes 1⅛″–1⅜″ up from the bottom edge

The app doesn't measure eyes. It places the chin at `CHIN_FROM_BOTTOM = 0.369`
of the frame height from the bottom, which lands the eyes inside the required
band for any head in the legal size range. That constant is load-bearing.

`solve()` computes the largest square crop the photo can support, bounded by
the shorter image side and by how far off-centre the face sits:

```
sideAvail = min(natW, natH,
                2 · min(midX, natW − midX),      // horizontal room
                chinY / (1 − CHIN_FROM_BOTTOM),  // room above the chin
                (natH − chinY) / CHIN_FROM_BOTTOM)
minHeadIn = 2 · headPx / sideAvail
```

`minHeadIn > 1.375` means no valid crop exists — the photo was taken too close
and no amount of cropping fixes it. The app refuses and says by how much.

For reference: a compliant shot needs the head at roughly 42–45% of a portrait
frame's height. In practice, frame from the top of the head down to the waist.

## Architecture

`index.html` is the entire app — markup, styles, logic, no dependencies, no build
step. Deliberate: it has to work offline from a home-screen icon.

Pipeline: photo → working canvas (capped at `MAX_EDGE = 2400`) → `#shot` canvas
→ crop canvas (600×600) → sheet canvas (1800×1200) → JPEG data URL.

Two entry points, one measuring screen:
- **Live camera** — `getUserMedia`, square viewfinder, three guide lines at the
  positions a compliant photo needs. Captures a square frame.
- **Use a photo** — file input.

## Constraints learned the hard way

**iOS canvas decode limit.** iPhone photos are ~24 MP, past what iOS will decode
into a canvas. `drawImage` doesn't throw — it silently produces a blank canvas.
Hence `MAX_EDGE`: every photo is redrawn once through a bounded working canvas,
and both the display and the crop read from that same canvas. This also removes
any EXIF-rotation mismatch between what the `<img>` showed and what the canvas saw.

**Camera needs a top-level HTTPS page.** Browsers block `getUserMedia` in
cross-origin iframes unless the embedding page grants it via the `allow`
attribute. Sandboxed previews (Claude artifacts, CodePen, etc.) don't, so the
camera tab fails there and falls back with an explanatory message. On Pages it
works normally.

**Bump `CACHE` in `sw.js` after any change.** Currently `passport-framer-v3`.
Skip this and installed phones keep serving the stale copy — the change simply
never appears, with no error.

## Bugs already fixed (don't reintroduce)

- Verdict computed from default handle positions the user never placed. On a
  square camera capture the defaults land at 1.3776″ vs a 1.375″ limit, which
  rounded to "too close by 0%". There's now a `placed` flag; nothing is judged
  until a handle is dragged, and near-misses report thousandths of an inch
  rather than a rounded percentage.
- Blank export on iOS — see the canvas decode limit above.
- Silent failure on the export button. Now wrapped, with the error surfaced.
- A disabled button with no explanation. It now states why it's disabled.

## Testing

No test suite. Verified with Playwright driving a mobile viewport: load a photo,
drag the handles, check the readout and the button state, click through to the
sheet, and sample the sheet's pixels to confirm it isn't blank. Chromium's
`--use-fake-device-for-media-stream` covers the camera path.

Worth keeping: a blank-output check on the sheet. That failure mode is silent
and would otherwise ship.

## Open items

- Untested on real iOS Safari. That's the one environment that matters and the
  one I couldn't reach.
- Straighten corrects a tilted camera, not a tilted head. Rotating to fix a
  cocked head slants the background, which is its own rejection risk. Possibly
  worth warning about in the UI.
- No EXIF orientation handling beyond what the browser applies. Fine so far
  because display and crop share one canvas, but worth a look if a photo ever
  comes out sideways.
- Sheet has zero margin — six 2″ photos exactly fill 6×4. Borderless kiosk
  prints overprint slightly and may shave the outer photos. Mitigated by asking
  for "actual size" at the kiosk, not solved.
