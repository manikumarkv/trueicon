# TrueIcon

[![npm](https://img.shields.io/npm/v/trueicon?style=flat-square)](https://www.npmjs.com/package/trueicon)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=trueicon&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22trueicon%22%5D%2C%22env%22%3A%7B%22TRUEICON_PROJECT_DIR%22%3A%22%24%7BworkspaceFolder%7D%22%7D%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=trueicon&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22trueicon%22%5D%2C%22env%22%3A%7B%22TRUEICON_PROJECT_DIR%22%3A%22%24%7BworkspaceFolder%7D%22%7D%7D&quality=insiders)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=trueicon&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInRydWVpY29uIl0sImVudiI6eyJUUlVFSUNPTl9QUk9KRUNUX0RJUiI6IiR7d29ya3NwYWNlRm9sZGVyfSJ9fQ%3D%3D)

TrueIcon is an [MCP](https://modelcontextprotocol.io) server that gives AI coding assistants exact, version-correct icon references. Your assistant searches the icon packages your project actually uses (`lucide-react`, `react-icons`, `@heroicons/react`, `@phosphor-icons/react`, `@tabler/icons-react`, `iconoir-react`, `@fluentui/react-icons`, `@carbon/icons-react`, `@ant-design/icons`) and gets back real icon names, import paths and a ready-to-paste `import` line.

## Why

AI assistants often guess icon names. The guess can be an icon that never existed, one renamed a few releases ago, or one from a different library, and you only find out when the build fails. TrueIcon closes that gap:

- It reads which icon packages and versions your project uses.
- It downloads those exact versions from npm and indexes every icon once.
- The assistant calls `search_icons` and gets results that are guaranteed to exist in that version, for example `import { Trash2 } from 'lucide-react';`.

## Supported providers

| Provider id   | npm package             | Icon naming                                                                                              |
| ------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `lucide`      | `lucide-react`          | Lucide's file names, e.g. `trash-2` → `Trash2`                                                           |
| `heroicons`   | `@heroicons/react`      | `<icon>-<size>-<style>`, e.g. `trash-24-outline` → `TrashIcon`                                            |
| `react-icons` | `react-icons`           | `<set>-<icon>`, e.g. `fa6-beer-mug-empty` → `FaBeerMugEmpty`                                              |
| `phosphor`    | `@phosphor-icons/react` | `<icon>` for the regular weight, `<icon>-<weight>` otherwise, e.g. `trash-bold` → `TrashIcon` with `weight="bold"` |
| `tabler`      | `@tabler/icons-react`   | Tabler's icon names, e.g. `trash` → `IconTrash`, `trash-filled` → `IconTrashFilled`                       |
| `iconoir`     | `iconoir-react`         | `<icon>` for regular, `<icon>-solid` for solid, e.g. `trash-solid` → `TrashSolid`                          |
| `fluentui`    | `@fluentui/react-icons` | `<icon>-<style>` with style `regular`, `filled` or `color`, e.g. `delete-regular` → `DeleteRegular`. Only the scalable (1em) icons are indexed, not the size-specific variants |
| `carbon`      | `@carbon/icons-react`   | Carbon's export names in kebab case, e.g. `trash-can` → `TrashCan`. Variants add `-filled`, `-alt` or `-color`, e.g. `accessibility-filled` → `AccessibilityFilled` |
| `antdesign`   | `@ant-design/icons`     | `<icon>-<theme>` with theme `outlined`, `filled` or `two-tone`, e.g. `delete-outlined` → `DeleteOutlined` |

Tools accept either the provider id or the npm package name (`"lucide"` or `"lucide-react"`). Usage snippets are for React. Phosphor weights all share one component, so pass the record's `style` as the `weight` prop (e.g. `<TrashIcon weight="bold" />`); the usage snippet only shows the import.

## Install

TrueIcon needs Node.js 20 or newer.

```sh
# Run without installing (this is what the MCP configs below do)
npx -y trueicon

# Or install globally and run the `trueicon` binary
npm i -g trueicon
trueicon
```

`trueicon` is a stdio MCP server. Your MCP client starts it; running it by hand only prints `trueicon: v0.2.0 running on stdio` to stderr and waits for JSON-RPC on stdin.

## Quick start

1. Add a `.iconmcp.json` to your project root that lists your icon packages:

   ```json
   {
     "providers": [
       { "package": "lucide-react" },
       { "package": "@heroicons/react", "version": "2.1.5" }
     ]
   }
   ```

2. Register TrueIcon with your MCP client ([Claude Code](#claude-code) or [Claude Desktop](#claude-desktop)).
3. Ask your assistant for an icon. The first search for each package downloads and indexes it, which takes a few seconds. Later searches use the local cache.

## Configuration: `.iconmcp.json`

TrueIcon looks for `.iconmcp.json` in the project directory. That is `$TRUEICON_PROJECT_DIR` if set, otherwise the server's working directory.

```json
{
  "providers": [
    { "package": "lucide-react" },
    { "package": "react-icons", "version": "5.3.0" },
    { "package": "@heroicons/react", "version": "^2.1.0" }
  ]
}
```

| Field                   | Type   | Required | Meaning                                                                                  |
| ----------------------- | ------ | -------- | ---------------------------------------------------------------------------------------- |
| `providers`             | array  | yes      | Icon packages the project uses. `search_icons` searches all of them by default.          |
| `providers[].package`   | string | yes      | npm package name: `lucide-react`, `react-icons`, `@heroicons/react`, `@phosphor-icons/react`, `@tabler/icons-react`, `iconoir-react`, `@fluentui/react-icons`, `@carbon/icons-react` or `@ant-design/icons`. |
| `providers[].version`   | string | no       | Exact version or npm range. If omitted, it is read from `package.json` (see below).      |

- If the file is missing, no providers are configured. `search_icons` then only works when you pass `provider` explicitly, and `get_icon` still works.
- Unsupported packages in the list are skipped, and `search_icons` reports them as a warning.
- Invalid JSON or a malformed entry makes the tools return an error that names the file and the bad field.

### Environment variables

| Variable               | Default               | Purpose                                              |
| ---------------------- | --------------------- | ---------------------------------------------------- |
| `TRUEICON_PROJECT_DIR` | working directory     | Project root holding `.iconmcp.json` and `package.json` |
| `TRUEICON_CACHE`       | `~/.trueicon/cache`   | Where downloaded packages and indexes are stored     |

## Versions

### Auto-detection

A provider's version is resolved in this order:

1. The `version` argument passed to the tool call, if any.
2. The provider's `version` in `.iconmcp.json`.
3. The version range declared for the package in the project's `package.json`, checking `dependencies` first and then `devDependencies`.

If none of these is available, the tool asks you to pin the version or add the package to `package.json`. TrueIcon reads the declared range from `package.json`. It does not read `node_modules` or the lockfile. For a range, it indexes the range's base version: `^0.460.0` indexes `lucide-react@0.460.0`. For `a || b` ranges, only the first part counts. To match an exact installed version, pin it in `.iconmcp.json`.

### Version policy

Indexes are keyed by **major.minor**:

- **Patch versions are ignored.** One index serves all of `0.460.x`. The index built from `0.460.0` answers requests for `0.460.3`.
- **A minor change gets its own index.** Bumping `lucide-react` from `0.460` to `0.461` builds a fresh index on the next search, with no manual step.
- **Majors are strict.** A different major is always a separate index and is never served from another major's index.
- **Cached indexes rebuild automatically** when the bundled `synonyms.json` changes (detected by hash) or the index format changes.

## Using it with Claude

### Claude Code

Add TrueIcon from your project directory:

```sh
claude mcp add trueicon -- npx -y trueicon
```

Or commit a `.mcp.json` at the project root to share it with your team:

```json
{
  "mcpServers": {
    "trueicon": {
      "command": "npx",
      "args": ["-y", "trueicon"]
    }
  }
}
```

Claude Code starts the server in your project directory, so it finds `.iconmcp.json` and `package.json` there. If it runs from somewhere else, add `"env": { "TRUEICON_PROJECT_DIR": "/absolute/path/to/project" }`.

### Claude Desktop

Claude Desktop doesn't start servers in your project directory, so set `TRUEICON_PROJECT_DIR`. Edit `claude_desktop_config.json`: `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

```json
{
  "mcpServers": {
    "trueicon": {
      "command": "npx",
      "args": ["-y", "trueicon"],
      "env": {
        "TRUEICON_PROJECT_DIR": "/absolute/path/to/your/project"
      }
    }
  }
}
```

Restart Claude Desktop after editing the file.

## Using it in VS Code and Cursor

Use the install badges at the top of this README. They add TrueIcon with `TRUEICON_PROJECT_DIR` set to `${workspaceFolder}`, so it searches the project you have open.

To add it by hand in VS Code, create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "trueicon": {
      "command": "npx",
      "args": ["-y", "trueicon"],
      "env": {
        "TRUEICON_PROJECT_DIR": "${workspaceFolder}"
      }
    }
  }
}
```

In Cursor, use the same entry under `"mcpServers"` in `.cursor/mcp.json`.

## Tools

Every tool returns a single JSON text block. On failure, the block is `{"error": "..."}` and the MCP result is flagged with `isError: true`.

### `search_icons`

Searches the index and returns ranked matches with import statements.

| Argument   | Type    | Required | Description                                                                          |
| ---------- | ------- | -------- | ------------------------------------------------------------------------------------ |
| `query`    | string  | yes      | What the icon should depict, e.g. `"trash"`                                          |
| `provider` | string  | no       | Provider id or package. Default: every provider in `.iconmcp.json`                   |
| `version`  | string  | no       | Version or range. Default: resolved as described in [Versions](#versions)            |
| `style`    | string  | no       | Exact style filter, e.g. `"outline"`, `"solid"`, `"filled"` (tabler), `"regular"` (fluentui), `"two-tone"` (antdesign) or a phosphor weight such as `"bold"`. Lucide icons are all `outline`; base carbon icons have no style |
| `set`      | string  | no       | Exact set filter, e.g. `"fa6"` or `"md"` for react-icons                             |
| `limit`    | integer | no       | Maximum results, 1 to 50, default 10                                                 |

Example call:

```json
{ "query": "trash", "provider": "lucide", "limit": 3 }
```

Response:

```json
{
  "results": [
    { "name": "trash", "importName": "Trash", "importPath": "lucide-react", "package": "lucide-react",
      "version": "0.460.0", "style": "outline", "set": "lucide",
      "usage": "import { Trash } from 'lucide-react';", "score": 2.0e-14 },
    { "name": "trash-2", "importName": "Trash2", "importPath": "lucide-react", "package": "lucide-react",
      "version": "0.460.0", "style": "outline", "set": "lucide",
      "usage": "import { Trash2 } from 'lucide-react';", "score": 1.6e-6 },
    { "name": "delete", "importName": "Delete", "importPath": "lucide-react", "package": "lucide-react",
      "version": "0.460.0", "style": "outline", "set": "lucide",
      "usage": "import { Delete } from 'lucide-react';", "score": 1.2e-4 }
  ]
}
```

How search works:

- `provider`, `style` and `set` are exact, case-insensitive filters. They are applied before ranking.
- Ranking uses [Fuse.js](https://www.fusejs.io/) fuzzy matching over the icon name, import name, keywords and tags. Small typos are tolerated: `"detele"` finds `Delete`.
- `score` runs from `0` (perfect) to `1`, so lower is better. Results from several providers are merged and sorted by score.
- Multi-word queries are tokenized: each word is matched on its own, only icons that match every word are kept, and they are ranked by their average score. So `"trash can"` finds `trash-can` icons. Short keyword queries (`"trash"`, `"settings"`, `"beer"`) still cast the widest net.
- If one provider fails, for example because its version can't be resolved or the download fails, its results are skipped and a `warnings` array explains why. The other providers still return results.

### `list_providers`

Takes no arguments. Returns the providers configured in `.iconmcp.json` with their resolved versions, plus every provider TrueIcon supports.

```json
{
  "configured": [
    { "id": "lucide", "package": "lucide-react", "version": "^0.460.0", "source": "package.json" },
    { "id": "heroicons", "package": "@heroicons/react", "version": "2.1.5", "source": "iconmcp.json" }
  ],
  "registry": [
    { "id": "react-icons", "package": "react-icons", "description": "Aggregated icon sets (Font Awesome, Material, Feather, and more) as React components" },
    { "id": "lucide", "package": "lucide-react", "description": "Lucide icons as React components" },
    { "id": "heroicons", "package": "@heroicons/react", "description": "Heroicons by the Tailwind CSS team as React components" },
    { "id": "phosphor", "package": "@phosphor-icons/react", "description": "Phosphor icons in six weights (thin, light, regular, bold, fill, duotone) as React components" },
    { "id": "tabler", "package": "@tabler/icons-react", "description": "Tabler icons (outline and filled) as React components" },
    { "id": "iconoir", "package": "iconoir-react", "description": "Iconoir icons (regular and solid) as React components" },
    { "id": "fluentui", "package": "@fluentui/react-icons", "description": "Microsoft Fluent UI System icons (regular, filled and color) as React components" },
    { "id": "carbon", "package": "@carbon/icons-react", "description": "IBM Carbon Design System icons as React components" },
    { "id": "antdesign", "package": "@ant-design/icons", "description": "Ant Design icons (outlined, filled and two-tone) as React components" }
  ]
}
```

`source` is `"iconmcp.json"` or `"package.json"`. `version` and `source` are `null` when neither file provides a version. `id` is `null` for a configured package TrueIcon doesn't support.

### `get_icon`

Gets the full record and import statement for an icon whose name the assistant already knows.

| Argument   | Type   | Required | Description                                                        |
| ---------- | ------ | -------- | ------------------------------------------------------------------ |
| `name`     | string | yes      | Icon name (`"trash-2"`) or import name (`"Trash2"`). Exact match first, then case-insensitive |
| `provider` | string | yes      | Provider id or package                                             |
| `version`  | string | no       | Version or range. Default: resolved as described in [Versions](#versions) |

Example call:

```json
{ "name": "Trash2", "provider": "lucide" }
```

Response:

```json
{
  "id": "lucide-react@0.460:trash-2",
  "name": "trash-2",
  "importName": "Trash2",
  "importPath": "lucide-react",
  "provider": "lucide",
  "package": "lucide-react",
  "version": "0.460.0",
  "style": "outline",
  "set": "lucide",
  "categories": [],
  "tags": [],
  "keywords": ["trash", "2", "delete", "remove", "bin", "garbage", "rubbish"],
  "svg": "<path d=\"M3 6h18\"/><path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\"/>…",
  "usage": "import { Trash2 } from 'lucide-react';"
}
```

`svg` is the icon's inner SVG markup, meaning the children of the root `<svg>` element. Heroicons uses the same import name in every size and style (`TrashIcon`). Pass the full variant name, such as `"trash-24-outline"`, to get a specific one.

### `ping`

A health check that returns `{"status":"ok","server":"trueicon"}`.

## Indexing and caching

The first time a tool needs `package@major.minor`, TrueIcon does the following:

1. It downloads the package tarball from `https://registry.npmjs.org`, verifies its sha512 integrity, and extracts it into the cache.
2. It parses the package's shipped files with the provider's adapter. Nothing is executed. Icons are read from the compiled source.
3. It writes `index.json` (one record per icon) and `meta.json` (exact version, synonyms hash, index format, build time).

Later calls only read `index.json`. Package files are never touched at query time, and your `node_modules` is never read or modified. If several tool calls need the same index at once, they share one download.

The cache root is `~/.trueicon/cache`, or `$TRUEICON_CACHE` if set:

```
~/.trueicon/cache/
├── lucide-react@0.460/          # extracted package + index.json + meta.json
├── react-icons@5.3/             # extracted package + index.json + meta.json
├── heroicons-react@2.1/         # extracted @heroicons/react package
└── @heroicons/react@2.1/        # index.json + meta.json for @heroicons/react
```

- Downloads go to `<package>@<major.minor>`, where scoped names are flattened: `@heroicons/react` becomes `heroicons-react`. A `.download-complete` marker is written last, and a directory without it is treated as partial and replaced.
- Indexes go to `<package>@<major.minor>/index.json` and `meta.json`. For unscoped packages this is the same directory as the download.
- The cache is safe to delete. It is rebuilt on demand, which needs network access.

Each record's `keywords` combine the name parts, the tags, and synonym expansions from the bundled `synonyms.json`. The expansions are added at index time, so `"bin"` finds `Trash2` without any extra work at query time.

## Contributing

```sh
git clone https://github.com/manikumarkv/trueicon.git
cd trueicon
npm ci
npm run build      # compile to dist/
npm test           # vitest
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

CI runs lint, typecheck and tests on Node 20 and 22 for every push and pull request.

### Extending `synonyms.json`

`src/synonyms/synonyms.json` maps a term to extra search terms:

```json
{
  "trash": ["delete", "remove", "bin", "garbage", "rubbish"],
  "logout": ["sign-out", "signout", "exit", "leave"]
}
```

- Keys are matched against an icon's name parts (the name split on `-`) and its tags. `trash-2` matches the key `trash`.
- Values are added to that icon's `keywords`.
- Expansion is one-way. If `bin` should also find icons named `delete`, add both `"trash": ["bin"]` and `"delete": ["bin"]`, or add a reverse entry.
- Write keys and values in lowercase, and give every key a non-empty array of strings. `tests/synonyms.test.ts` checks this.
- Changing the file changes its hash, so cached indexes rebuild automatically on the next search.

### Adding a provider

1. **Register it** in `src/providers/registry.ts` with a stable `id`, the npm `package` and a short `description`.
2. **Write an adapter** in `src/providers/adapters/<provider>.ts` that exports `parseIcons(packageDir: string): RawIcon[]` (see `src/providers/adapter.ts`). It gets the extracted package directory and returns one `RawIcon` per icon:
   - `name`: kebab-case and **unique within the package**, because it becomes part of the record id. Use `toKebabCase` from `adapter.ts`. If the package has variants with clashing component names, add the variant to the name, as the heroicons, react-icons, phosphor and iconoir adapters do.
   - `importName` and `importPath`: the exact export and module specifier a user would import.
   - `svg`: the inner SVG markup. `LiteralCursor` (`src/providers/jsLiteral.ts`) parses JS object and array literals without executing code. `toSvgAttrs` and `renderSvg` (`src/providers/svg.ts`) turn React props into SVG markup, and `parseCreateElement` reads compiled `createElement(...)` trees.
   - Optional `style`, `set`, `categories` and `tags`.
   - Put a comment at the top of the adapter describing the package's file layout, as the existing adapters do.
3. **Wire it up** in `src/providers/adapters/index.ts` by adding it to `ADAPTERS` under the provider id.
4. **Test it.** Add a small pinned fixture under `tests/fixtures/<provider>/` that mirrors the package layout, with a few real icon files plus any files the adapter must skip. Then add `tests/adapters/<provider>.test.ts`, covering name mapping, import paths, SVG output and `buildIndex` record ids like the existing adapter tests. `tests/adapters/common.test.ts` fails if a registered provider has no adapter.

## License

[MIT](LICENSE) © 2026 manikumarkv
