# Premium home: proven asset corruption, not a new layout theory

## Scope and evidence

Audited source: `c366e73b9703da48a9431443c167f2862f85df0c`.
APK: Fast UI Preview #9, run `34710461081`, artifact `10303461841`.
The APK was downloaded, unzipped, and its actual WebP resources were fully decoded with Pillow 12.3.0 / libwebp. Blob SHA-1 is computed with Git's `blob <length>\0` prefix. These SHAs exactly match the repository files; this is not an assumption based on filenames.

| Layer | APK resource | Actual bytes | RIFF declared total bytes | Full decode | Git blob SHA |
|---|---|---:|---:|---|---|
| haussmann | res/9Q.webp | 13498 | 13472 | ERROR | a1929d02ec8bbdc959ac1ad8198a6132b68d2f87 |
| collectif | res/my.webp | 14333 | 14190 | ERROR | 55b60c6a7533af4852e7b5c94fe767d4c5769338 |
| poste-municipal | res/dp.webp | 11466 | 12238 | ERROR | f88a1b8585727129d54018e87c9a1294810f0ace |
| building | res/R_.webp | 11766 | 11766 | OK | e574cd583c796436c4cb91ae5f90e8068586f5b3 |

All three invalid files raise `OSError: could not create decoder object`. Their RIFF chunk boundaries are also inconsistent. Merely adjusting the length field is not a validated repair: isolated VP8 payloads for haussmann and municipal also fail decoding. The historical `feat/spiral-active-ui-test-v2` branch contains these exact same blob SHAs. Retrying earlier UI layouts therefore reuses the same corrupt assets.

The valid fourth asset is 1024 x 540 RGBA, with nonempty alpha bounds `(713, 23, 1024, 540)`. The user's screenshot shows precisely this right-hand building. This is strong evidence for the missing-buildings cause. It does not prove that all remaining Android layout/animation issues are solved.

## Earlier conclusions to retract

- Four files plus an alpha flag is not a render test. The old validator read headers and searched for byte strings; it did not traverse RIFF chunks or decode pixels.
- Replacing the four layers with a historic single photograph masked the defect and violated the user's independent-building requirement.
- The original composite blob is still present as `res/Es.webp` in APK #9, despite removal of its premium-pack path. Its presence alone does not establish whether another feature references it or a cached generated resource remains. Do not claim that a file-path deletion proves absence from an APK.
- There is no evidence here to blame the user's cache, device, or APK installation. The downloaded artifact itself contains the bad bytes.
- The exact step that corrupted the files is not established. Do not label this a WebP-format limitation or assert a particular upload/base64 failure without additional evidence.

## Safe correction sequence

1. Recover the original four transparent building layers (the earlier `frames.zip` or original PNG/WebP exports). They were not recovered from the currently accessible local files or File Library search. The inspected historical branch has the same corrupt copies, not valid backups.
2. Preserve the intended buildings, shared registration/canvas, transparency and individual convergence. Do not substitute a single old photo, synthesize new buildings, or silently accept partial decoding.
3. Transfer binary assets without hand-editing compressed/base64 streams. Record before/after SHA-256 and Git blob hashes.
4. Run the structural validator, full pixel decoder, alpha-content tests and the four-layer visibility/composition check. A decoded file alone does not prove its architectural identity; inspect the generated composition against the approved reference.
5. Add full decoding as a blocking preflight in the APK workflow and repeat with `--apk <built.apk>` before artifact/release upload. The independent integrity workflow in this diagnostic PR is a check, not by itself a cross-workflow release dependency or branch protection rule.
6. Verify on Android: all four images report load success (and log/display explicit load failures), all four appear at the final frame, animations do not hide them, portrait/landscape and enlarged text remain usable. Do not call a Pillow composition an Android screenshot.
7. Only then deliver one new Preview APK with its precise commit/build ID. Do not merge to native-android before visual acceptance.

## Other visible issues, kept separate from asset corruption

The narrow screenshot still truncates Collectivite and shows conspicuous blocks behind text. These need layout/style checks; the evidence above does not identify their cause. The current layout uses window dimensions and minimum vertical positions. Screenshot physical pixels must not be assumed to equal React Native logical layout units. Check the actual available root layout and text scale before setting new breakpoints.

## Work in this diagnostic change

- A strict, dependency-free JS RIFF/chunk validator replaces the header-only validation already called by `verify:metra` on this branch.
- A CI-only Python pixel/alpha validator also checks exact asset inclusion in an APK and produces JSON evidence plus a composition only when every check succeeds.
- Eight self-tests pass locally: valid pixels, truncation, dimensions, opaque background, empty layer, four visible layers, alpha-layer occlusion, APK round trip/missing asset.
- An independent, short GitHub Actions asset audit collects failures without compiling an APK.
- Production image bytes and UI layout are not changed in this diagnostic PR. It remains blocked pending original assets; a red integrity check on the current assets is expected, not a successful visual repair.

## Reproduce

```sh
python -m pip install Pillow==12.3.0
python .github/scripts/test_premium_home_images.py
node .github/scripts/validate_premium_home_scene.js
python .github/scripts/validate_premium_home_images.py --output asset-audit
python .github/scripts/validate_premium_home_images.py --apk METRA-UI-PREVIEW-9.apk --output apk-audit
```

The last three checks must reject the current corrupt files. Sources: Google WebP RIFF container specification; Pillow Image.open/load documentation; source/manifest at the audited commit; decoded artifact bytes. Historical conversation access was partial: no claim is made to have retrieved every project conversation or every approved visual.
