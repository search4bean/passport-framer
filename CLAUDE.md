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

Pipeline: photo → working canvas (bounded by `DECODE_RUNGS`) → `#shot` canvas
→ crop canvas (1200×1200) → sheet canvas (3600×2400) → JPEG blob.

Output is 600 dpi, not the 300 dpi minimum. Kiosks resample the upload onto their
own print raster, and a file with no margin above the minimum goes soft in that
second resample — which is exactly what a 300 dpi sheet came back looking like.
`stepDraw()` halves repeatedly instead of letting one bilinear pass span a >2×
downscale, and `stampDPI()` writes the real density into the JFIF APP0 header for
kiosks that size from the header rather than the pixel count.

### Background and lighting

Two optional passes, both off by default, both applied before the crop so the export
inherits them. Neither uses a model: a model means a download, and this has to work
offline with the photo never leaving the phone. They lean instead on two things that
are true of a passport photo and not of photos generally — the background is meant to
be plain and touches the frame edge, and the subject is wherever the handles were just
placed.

**Background** (`bgMask`) scores each pixel on *chromaticity* distance from a reference
colour learned at the frame edge, not on colour distance. A shadow on a white wall is
the same hue at a lower level; treating that as "not background" is what leaves a grey
smear behind the head. A flood fill from the top and upper sides then discards anything
not joined to the frame edge, which is what stops a white shirt or a bright forehead
reading as wall. The result is a soft matte, blurred and upsampled — deliberately a
matte and not a cut-out, because a soft edge that is slightly wrong reads as a slightly
uneven wall, where a hard edge that is slightly wrong reads as a bad cut-out and gets
the photo rejected. Clean blends 78% toward white, White goes all the way.

The subject guard is *not* absolute. It widens quadratically below the chin so it hugs
the neck, and a pixel that matches the wall unmistakably is cleaned even inside it.
Both of those exist because of the same bug: a guard that fanned out linearly from the
chin was far wider than a real neck, so it protected wall, and a pale wedge appeared
under the jaw. Do not widen it back.

**Lighting** (`toneLUTs`, `illumField`) white-balances off the background — which is
supposed to be white, making it the most trustworthy reference in the frame and better
than a grey-world guess a warm shirt would skew. Exposure is set from the median
luminance *inside the head*, since an average over the frame mostly measures how big
the background is, and applied as gamma so lifting a dark face does not clip the wall
behind it. A heavily blurred luminance map estimates how the light fell and divides it
out, which flattens a side-lit face; kept gentle, because taken far it flattens the
face too.

Measured on a deliberately bad frame (cool cast, wall falling off across the frame,
underexposed side-lit subject): face 87 → 144, colour cast 22 → 6, wall unevenness
34 → 15 on lighting alone; wall unevenness → 0 and cast → 0 on White.

**Resolution split.** The preview runs the passes at `PREVIEW_EDGE` (1500) so the
controls stay responsive; the export runs them once more at full resolution, clipped
to the crop square since nothing outside it is ever read back. Same parameters both
times, so what you judged on screen is what prints. Verified pixel-identical with and
without the clip.

Two entry points, one measuring screen:
- **Live camera** — `getUserMedia`, square viewfinder, three guide lines at the
  positions a compliant photo needs. Captures a square frame.
- **Use a photo** — file input.

## Constraints learned the hard way

**iOS canvas decode limit.** iPhone photos are ~24 MP, past what iOS will decode
into a canvas. `drawImage` doesn't throw — it silently produces a blank canvas.
Hence `DECODE_RUNGS`: every photo is redrawn once through a bounded working canvas,
and both the display and the crop read from that same canvas. This also removes
any EXIF-rotation mismatch between what the `<img>` showed and what the canvas saw.

The bound is on total **area** (12 Mpx), not just the long edge — a square 4096 px
photo is 16.8 Mpx and over the limit while a 4096-wide 4:3 one is 12.6 Mpx and fine.
`loadSrc` walks down the rungs whenever a decode returns blank, so the top rung can
afford to be greedy. Keep it that way: pixels dropped here are detail the printed
photo can never recover, and the old flat 2400 cap was throwing away ~64% of a
12 MP phone photo before the crop even ran.

**Camera needs a top-level HTTPS page.** Browsers block `getUserMedia` in
cross-origin iframes unless the embedding page grants it via the `allow`
attribute. Sandboxed previews (Claude artifacts, CodePen, etc.) don't, so the
camera tab fails there and falls back with an explanatory message. On Pages it
works normally.

**Bump `CACHE` in `sw.js` after any change.** Currently `passport-framer-v7`.

The app shell is served **network-first**, everything else cache-first. It was all
cache-first, which made every redeploy land one launch late — the phone served the
previous copy, quietly folded the new one into the cache behind it, and the change
only showed up the next time the app was opened. That is indistinguishable from the
change not working, and it burned a real debugging cycle. Network-first falls back
to cache on failure and after a 3 s timeout, so offline still works.

Note this does not rescue the launch *immediately* after a deploy from an older
cache-first worker: that one still serves stale, because the old worker answers
before the new one takes over. Bumping `CACHE` is still required.
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
- The background matte has never been tried on real hair. Wispy or backlit strands
  are where a classical matte is weakest, and White is the setting that will show it.
  The UI says so; a real photo is still the only way to know.
- White mode will whiten a genuinely white shirt if the wall reaches it from the frame
  edge. The subject guard is the only thing standing in the way and it is deliberately
  permissive. Clean is unaffected in practice, since it only blends part way.
- No EXIF orientation handling beyond what the browser applies. Fine so far
  because display and crop share one canvas, but worth a look if a photo ever
  comes out sideways.
- Sheet has zero margin — six 2″ photos exactly fill 6×4. Borderless kiosk
  prints overprint slightly and may shave the outer photos. Mitigated by asking
  for "actual size" at the kiosk, not solved.
