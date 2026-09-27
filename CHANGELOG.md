# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `search_icons` ranks icons whose name answers the query first: an exact name, then names starting with the query, then the query as a phrase, then names containing every query word or reaching it through a synonym. Within each level shorter names win and each icon's style variants stay together, default style first. So `trash` on MUI returns `Delete` instead of `RestoreFromTrash`, `delete` on Remix returns `RiDeleteBinLine` before `RiChatDeleteLine`, and `arrow right` returns `arrow-right` before `circle-arrow-right`. Scores encode this order, so it holds when several providers are merged.

## [0.4.0] - 2026-09-25

### Added

- Six new icon providers, bringing the total to fifteen:
  - `@mui/icons-material` (`mui`), about 10,750 icons in filled, outlined, rounded, sharp and two-tone themes.
  - `@radix-ui/react-icons` (`radix`), about 318 icons.
  - `@remixicon/react` (`remix`), about 3,227 icons in line and fill styles.
  - The Font Awesome Free packages `@fortawesome/free-solid-svg-icons` (`fontawesome-solid`), `@fortawesome/free-regular-svg-icons` (`fontawesome-regular`) and `@fortawesome/free-brands-svg-icons` (`fontawesome-brands`), about 2,160 icons. Old names of renamed icons, such as `trash-alt`, are searchable as tags.
- Opt-in semantic search for `search_icons`: set `"semantic": true` in `.iconmcp.json` (or `TRUEICON_SEMANTIC=1`) to merge cosine-similarity ranking over per-icon embedding vectors with the keyword ranking, using reciprocal rank fusion. Vectors come from a small local model (`Xenova/all-MiniLM-L6-v2`, ~90MB downloaded once), built into `index.json` at index time; `meta.json` records the embedding model so toggling the flag rebuilds indexes automatically. Fully offline after the first download. `@huggingface/transformers` is an optional peer dependency and is not installed by default (about 400MB); run `npm install @huggingface/transformers` to enable semantic search. Without it, `search_icons` falls back to keyword search with a warning that gives the install command.
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

[Unreleased]: https://github.com/manikumarkv/trueicon/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/manikumarkv/trueicon/compare/v0.3.1...v0.4.0
[0.2.0]: https://github.com/manikumarkv/trueicon/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/manikumarkv/trueicon/releases/tag/v0.1.1
