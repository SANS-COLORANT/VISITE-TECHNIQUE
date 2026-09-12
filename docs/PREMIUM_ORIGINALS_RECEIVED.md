# Original artwork received and verified

This is an intake report, not a claim that the corrected APK or velvet player is delivered.

## Source files

All eight supplied building files fully decode: four PNG and four static WebP.
Each source is 4096 x 2160 with a real alpha channel. The exports already share
one coordinate system: keep their transparent margins, order and aspect ratio.
Do not independently crop/stretch/recenter the four buildings.

The prepared layers use the PNG originals as masters, a common reduction to
2048 x 1080, and lossless WebP encoding. Each output was fully decoded and its
RGBA bytes compared to the normalized PNG pixels. The originals are unchanged.
The four outputs together weigh 1,206,876 bytes. The visible alpha contributions
after superposition, back to front, are 60.5652%, 71.2708%, 76.6154%, and 100%.
This is a composition measurement, not an Android screenshot or FPS test.

Mapping: Paris -> haussmann/Copro; Collectif -> collectif/Bailleur;
Municpale -> poste-municipal/Collectivite; Building -> building/Tertiaire.
No composite photograph is included in the runtime package.

## Velvet animation

`METRA_Spirale_Intro_V4.webp` is preserved byte for byte:

- SHA256: b1b3f84882584e0b64fe6f832870b188a16c78e94610434f55de7d4105c1408d
- Size: 12,489,004 bytes; canvas: 2048 x 1024.
- All 147 frames decoded; total duration: 4,900 ms; loop count: 1.
- Per-frame duration, decoded pixel SHA256 and alpha bounds are recorded.
- Last frame alpha bounds: [797, 771, 1216, 1024]; clipped at bottom.
- A lossless PNG of the final full canvas is included as a reference, NOT a
  complete circular texture for the rotating dock.

The current runtime still uses the old 2500 ms SVG startup preset. This intake
intentionally does not relabel it as the new animation or enable an untested
player. Animated WebP native support and the real animation-finished callback
must be validated before switching the preset. An approximate JS timer alone
must not be used as proof of playback completion.

For the raccord, use one common coordinate transformation and preserve the
original aspect ratio. The last visible alpha bounds have horizontal center
1006.5, not 1024. A portrait `cover` crop or stretching the truncated final frame
into a square would produce another wrong result. Preserve the existing spiral
gestures; do not reconstruct unseen pixels or swap to a visibly different SVG
while claiming an exact velvet transition.

Official playback reference: https://frescolib.org/docs/animations.html
Official format reference: https://developers.google.com/speed/webp/docs/riff_container

## Transfer status and one-file intake

The media are prepared in the conversation sandbox, not yet stored in this GitHub
branch. The available connector accepts text/base64 strings, not direct uploads
of these large local binary files; network Git transport from the execution
container is unavailable. Do not manually transcribe the compressed binaries.

The archive `METRA_ASSETS_VALIDES.zip` contains exactly nine reviewed files and
has SHA256 ca6cafbaadeb5382c62ea64dfdda5ba6dbe3829cb46b4242c7955e72237dc26e.
Its size is 13,783,214 bytes. The approval table is committed separately in
`.github/premium-assets-approved.json`; it does not trust a checksum supplied
by an arbitrary uploaded ZIP.

Upload this ZIP unchanged to the repository ROOT on branch
`work/premium-home-asset-integrity`, not `native-android`. The workflow
`Import verified premium media` validates the archive and each member, fully
decodes the four buildings and 147 animation frames, verifies the final-frame
reference, refuses unexpected paths and manifest changes, then writes the files.
It runs the existing scene/model/image checks before committing anything.
The ZIP is removed from the working tree after import; its upload commit remains
in Git history. Sources in the conversation are not modified or deleted.

The import does not merge PR #81, start an APK, or enable the velvet runtime.
A GitHub-token commit does not itself guarantee that other workflows re-run;
therefore the import job runs the required tests before its commit.

## Next acceptance gates

1. Successful GitHub import, matching hashes and existing regression tests.
2. Review layout and converging motion using the healthy independent layers.
3. Implement and verify native velvet playback/end event and dock raccord.
4. Generate one Preview APK with source-to-APK byte checks and download checks.
5. Native portrait/landscape, large text, resume, reduced-motion, local navigation
   and dock gesture tests. Never equate static composition or compilation with
   real-device visual acceptance.

No production branch, SQLite data, API authentication, report export, or field
visit data is changed by this intake preparation.
