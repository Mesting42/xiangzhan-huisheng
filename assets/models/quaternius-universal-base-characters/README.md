# Quaternius Universal Base Characters — local asset copy

- Download source: https://quaternius.itch.io/universal-base-characters
- Original free Standard archive (local only, not tracked in Git): `source/Universal-Base-Characters-Standard.zip`
- License: CC0 1.0 Universal. See `License_Standard.txt` and https://creativecommons.org/publicdomain/zero/1.0/.
- Local extracted glTF files are in `gltf/`; that duplicate extraction is not tracked in Git. The repository includes the complete runtime copies in `public/assets/models/quaternius/`, with their `.bin` and referenced PNG textures for offline loading.
- The source archive's two glTF files refer to two normal maps using `_png.png` filenames that are absent from the archive. The extracted working copies include matching filename copies so Three.js can resolve the glTF references; the original download is preserved unchanged in `source/`.

The free Standard archive contains the male and female Superhero FullBody glTF variants. The game uses the compatible head geometry and original eye materials from these models with the Peasant outfits in `public/assets/models/quaternius-outfits/`. The outfit rig carries the combat poses, so the full base body is intentionally omitted to avoid clothing clipping.
