# Greywater regional map provenance

`greywater-region.webp` was generated for Portents with shopp-e using Gemini 3 Pro, then converted from the returned PNG bytes to an actual WebP with `cwebp -q 72 -resize 1200 0`.

Generation prompt:

> An unlabeled overhead fantasy regional map for a tabletop roleplaying setting called Greywater. A broad dark river runs west to east through rain-soaked marshland and low wooded hills. Include a small walled river city near the center, an old shrine downstream on the south bank, a causeway crossing flooded flats, three minor villages, and a ruined watchtower in northern hills. Antique hand-painted ink and muted watercolor on weathered parchment, restrained charcoal, moss green, river blue and rust palette, clear geographic shapes, no grid, no legend, absolutely no words, letters, labels, symbols, title, border text, or typography. Wide landscape composition suitable for interactive pins.

Generated output: 1584×672 PNG, reported by shopp-e as 2.33 MB. Final checked asset: 1200×510 WebP, 83 KiB. The package test reads the WebP frame header and compares its dimensions to the typed map manifest, so a renamed PNG or stale declaration fails.

The prompt, final asset, setting prose, metadata, and any rights the project may hold in them are dedicated to the public domain under CC0-1.0. No third-party map or setting artwork was used as an input.
