# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Opt-in semantic search for `search_icons`: set `"semantic": true` in `.iconmcp.json` (or `TRUEICON_SEMANTIC=1`) to merge cosine-similarity ranking over per-icon embedding vectors with the keyword ranking, using reciprocal rank fusion. Vectors come from a small local model (`Xenova/all-MiniLM-L6-v2`, ~90MB downloaded once), built into `index.json` at index time; `meta.json` records the embedding model so toggling the flag rebuilds indexes automatically. Fully offline after the first download.
- Greatly expanded the bundled `synonyms.json` (78 → 345 concepts) covering files, editing, media, devices, weather, finance, layout/UI, social, nature and more, with 20 new search-eval cases proving they resolve.

## [0.2.0] - 2026-09-24

### Added

- Six new icon providers, bringing the total to nine:
  - `@phosphor-icons/react` (`phosphor`), `@tabler/icons-react` (`tabler`) and `iconoir-react` (`iconoir`), which together add thousands more icons.
  - `@fluentui/react-icons` (`fluentui`), about 5,892 icons in regular, filled and color styles.
  - `@carbon/icons-react` (`carbon`), about 2,775 icons.
  - `@ant-design/icons` (`antdesign`), about 848 icons in outlined, filled and two-tone themes.

### Changed

- `search_icons` now tokenizes multi-word queries. Each word is matched on its own, only icons matching every word are kept, and results are ranked by their average score, so `"trash can"` finds `trash-can` icons.

### Fixed

- The server now reports its real version during the MCP handshake and in its startup log. It previously reported `0.1.0`.

## [0.1.1] and earlier

- Supported the `react-icons`, `lucide-react` and `@heroicons/react` providers.

[0.2.0]: https://github.com/manikumarkv/trueicon/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/manikumarkv/trueicon/releases/tag/v0.1.1
