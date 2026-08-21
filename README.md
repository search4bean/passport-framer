# Passport Photo Framer

A single-page tool for producing US passport photos (2×2 in, head 1″–1⅜″). It measures
the head in a photo, tells you whether a compliant crop is possible, and if it is,
produces a 600×600 crop and a 6×4 in print sheet with six copies at 300 dpi.

Everything runs in the browser. No photo ever leaves the device — there is no server,
no upload, and no analytics.

## Deploying to GitHub Pages

1. Create a new repository. On the free plan it has to be **public** for Pages to
   serve it, which is fine — there is nothing private in this code.
2. Upload the contents of this folder to the repository root (not the folder itself —
   `index.html` must sit at the top level).
3. Repo → **Settings → Pages**. Under "Build and deployment", set Source to
   **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. Wait about a minute. The site appears at
   `https://<your-username>.github.io/<repo-name>/`.

Open that URL in Safari on your phone, then Share → **Add to Home Screen**.

## Cleaning up the photo

Two optional controls on the measuring screen, both off unless you turn them on:

- **Background — Clean / White.** Evens out the wall, takes the colour cast off it, and
  pushes it toward white. *Clean* blends part of the way and leaves no hard edge around
  the hair; *White* goes all the way. Clean is the safer of the two — check the hair
  edge before printing a White one, because a visible cut line is its own rejection risk.
- **Lighting — Auto.** White-balances off the background, sets the exposure from the
  face rather than the whole frame, and evens out a side-lit face. The strength slider
  backs it off if it goes too far.

Both run entirely in the page, like everything else here, and both are applied before
the crop, so the printed sheet gets them. *Hold to compare* shows the original while
you hold it.

## Why the hosting matters

The camera only works on a real top-level HTTPS page. Inside an embedded frame —
which is how Claude artifacts, CodePen previews and similar sandboxes run — browsers
block `getUserMedia` unless the embedding page explicitly grants it, so the live
camera tab will fail there. Served from Pages, it behaves like any normal website
and Safari prompts for permission.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app — markup, styles and logic |
| `manifest.webmanifest` | Name, icons and standalone display for Add to Home Screen |
| `sw.js` | Service worker; caches the app so it runs with no signal |
| `icons/` | App icons, including a maskable variant for Android |
| `.nojekyll` | Stops GitHub Pages running the files through Jekyll |

## Editing it later

After changing any file, bump `CACHE` in `sw.js` (e.g. `passport-framer-v8`).
Otherwise phones that already installed it keep serving the cached copy and your
change never appears.

## The geometry, if you want to check my work

On a 2×2 photo the State Department requires the head to measure 1″–1⅜″ from chin
to crown, with the eyes 1⅛″–1⅜″ up from the bottom edge. This tool places the chin
at 0.369 of the frame height from the bottom, which puts the eyes inside that band
for a head anywhere in the legal size range.

The crop is square, so the largest one available is bounded by the photo's shorter
side and by how far off-centre the face sits. If the head is more than 68.75% of
that square, no valid crop exists and the photo was simply taken too close — the
tool says so and reports by how much rather than producing something that will be
rejected.
