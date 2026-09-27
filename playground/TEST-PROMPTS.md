# Manual test prompts

Prompts to paste into an MCP client to check TrueIcon end to end, the way people use it. Run them before a release or after changing search, an adapter or the config loading.

Each test lists the prompt, the tool call the assistant should make, and what counts as a pass. The assistant may word its answer differently; judge the tool call and the icons it returns.

## Setup

Build the server and register it against this folder, which lists all 15 providers:

```sh
npm run build
claude mcp add trueicon-dev -e TRUEICON_PROJECT_DIR="$(pwd)/playground" -- node "$(pwd)/dist/index.js"
```

Start a new Claude Code session so it picks up the server. The first search for each package downloads and indexes it, which takes a few seconds. To look at raw tool output without an assistant, use `npm run dev:call -- <tool> key=value ...` instead; it uses the same playground.

Tests marked **Known gap** describe current behavior that is not what we want yet. They should keep failing the same way until the gap is fixed.

## 1. Setup and project detection

**1.1 Providers**

> Which icon libraries can you search in this project?

- Calls `list_providers`.
- Pass: `project.source` is `TRUEICON_PROJECT_DIR`, `providersFrom` is `package.json`, and all 15 providers are `configured` with `source: "package.json"` and the version ranges from `playground/package.json`.

**1.2 Supported list**

> Which icon packages does TrueIcon support in general?

- Calls `list_providers`.
- Pass: the answer lists the 15 `registry` entries, including the three Font Awesome packages.

## 2. Basic search

**2.1 Across every library**

> Find me a trash icon.

- Calls `search_icons` with `query: "trash"` and no provider.
- Pass: the top results are exact `trash` icons from several libraries (react-icons `BiTrash`, lucide `Trash`, phosphor `TrashIcon`, tabler `IconTrash`, iconoir `Trash`, radix `TrashIcon`, Font Awesome `faTrash`), each with an import line.

**2.2 One library by id**

> I'm using Lucide. What's the icon for settings?

- Calls `search_icons` with `provider: "lucide"`.
- Pass: first result is `settings` → `import { Settings } from 'lucide-react';`.

**2.3 One library by npm package name**

> Search lucide-react for a trash icon, top 3 only.

- Calls `search_icons` with `provider: "lucide-react"` and `limit: 3`.
- Pass: exactly 3 results, first is `trash` → `import { Trash } from 'lucide-react';`.

**2.4 Limit is capped**

> Give me 500 lucide arrow icons.

- Calls `search_icons` with a large `limit`.
- Pass: at most 50 results come back.

**2.5 Default limit**

> Show me heart icons from Tabler.

- Pass: 10 results when no limit is given, first is `heart` → `IconHeart`.

## 3. Search quality

**3.1 Synonyms**

> I need a garbage icon from Tabler.

- Pass: first result is `trash` → `IconTrash`, found through the garbage → trash synonym.

**3.2 Typos**

> Lucide icon for "detele".

- Pass: first result is `delete` → `Delete`.

**3.3 Multi-word query**

> Font Awesome solid trash can icon.

- Calls `search_icons` with `query: "trash can"` and `provider: "fontawesome-solid"`.
- Pass: first result is `trash-can` → `faTrashCan`.

**3.4 No results**

> Search for "zzzzqqq".

- Pass: `results` is empty, and the assistant says nothing matched instead of inventing an icon.

**3.5 Exact name before composites** (issue #17)

> MUI icon for trash.

- Pass: first result is `delete` → `import { Delete } from '@mui/icons-material';`, not `RestoreFromTrash`.

> Remix icon for delete.

- Pass: the first results are `delete-back-*` and `delete-bin-*`, ahead of `chat-delete-*`.

> Arrow right icon from MUI.

- Pass: first result is `arrow-right` → `ArrowRight`.

> Home icon from Fluent UI.

- Pass: first results are `home-color`, `home-filled`, `home-regular`, ahead of `building-home-*`.

**3.6 Default style first**

> MUI delete icon.

- Pass: `Delete` comes before `DeleteOutlined`, `DeleteRounded` and `DeleteSharp`.

**3.7 Variant numbers**

> Lucide trash icon, version 0.460.0.

- Calls `search_icons` with `version: "0.460.0"`.
- Pass: `trash` first, then `trash-2`.

## 4. Filters

**4.1 Style**

> Heroicons trash icon, solid style only.

- Calls `search_icons` with `style: "solid"`.
- Pass: every result has style `solid`, e.g. `trash-16-solid` → `import { TrashIcon } from '@heroicons/react/16/solid';`.

**4.2 Phosphor weight**

> Phosphor trash icon in bold.

- Calls `search_icons` with `style: "bold"`.
- Pass: `trash-bold` → `import { TrashIcon } from '@phosphor-icons/react';`, and the assistant renders it with `weight="bold"`.

**4.3 react-icons set**

> A beer icon from Font Awesome 6 in react-icons.

- Calls `search_icons` with `provider: "react-icons"` and `set: "fa6"`.
- Pass: every result is from `react-icons/fa6`, first is `FaBeerMugEmpty`.

## 5. get_icon

**5.1 By name**

> Give me the full details for the lucide icon "trash".

- Calls `get_icon` with `name: "trash"`, `provider: "lucide"`.
- Pass: the record includes `svg`, `version` and `usage: "import { Trash } from 'lucide-react';"`.

**5.2 By import name**

> Get DeleteOutlined from @ant-design/icons.

- Pass: returns `delete-outlined` with `usage: "import { DeleteOutlined } from '@ant-design/icons';"`.

**5.3 Renamed icon**

> Is Trash2 still in lucide-react? I have old code using it.

- Calls `get_icon` with `name: "Trash2"`.
- Pass: returns `trash` → `import { Trash } from 'lucide-react';` (Trash2 is listed in its `tags`), and the assistant suggests the current name.

> Font Awesome solid: I have faTrashAlt in old code, what's it called now?

- Calls `get_icon` or `search_icons` with `trash-alt`.
- Pass: returns `trash-can` → `faTrashCan`.

**5.4 Missing icon**

> Get the lucide icon "no-such-icon".

- Pass: the tool returns `Icon "no-such-icon" not found in lucide (lucide-react@…)`, and the assistant searches instead of guessing.

**5.5 Known gap: old Font Awesome export names**

> Get faSearch from @fortawesome/free-solid-svg-icons.

- Today: `Icon "faSearch" not found`. `faSearch` still works as an export in Font Awesome 6+, but TrueIcon only indexes it as the `search` tag of `faMagnifyingGlass`.
- Pass once fixed: returns `magnifying-glass` → `faMagnifyingGlass`.

## 6. Every provider

One prompt per provider. Pass: the first result and its import line match.

| Prompt | First result |
| --- | --- |
| react-icons Feather user icon (`set: "fi"`) | `import { FiUser } from 'react-icons/fi';` |
| Lucide search icon | `import { Search } from 'lucide-react';` |
| Heroicons outline bell icon | `import { BellIcon } from '@heroicons/react/24/outline';` |
| Phosphor house icon | `import { HouseIcon } from '@phosphor-icons/react';` |
| Tabler settings icon | `import { IconSettings } from '@tabler/icons-react';` |
| Iconoir solid trash icon | `import { TrashSolid } from 'iconoir-react';` |
| Fluent UI home icon | `import { HomeColor } from '@fluentui/react-icons';` (or `HomeFilled` / `HomeRegular`) |
| Carbon trash can icon | `import { TrashCan } from '@carbon/icons-react';` |
| Ant Design delete icon | `import { DeleteFilled } from '@ant-design/icons';` (or `DeleteOutlined` / `DeleteTwoTone`) |
| MUI delete icon | `import { Delete } from '@mui/icons-material';` |
| Radix settings icon | `import { GearIcon } from '@radix-ui/react-icons';` |
| Remix search icon | `import { RiSearchFill } from '@remixicon/react';` (or `RiSearchLine`) |
| Font Awesome solid user icon | `import { faUser } from '@fortawesome/free-solid-svg-icons';` |
| Font Awesome regular star icon | `import { faStar } from '@fortawesome/free-regular-svg-icons';` |
| Font Awesome GitHub logo | `import { faGithub } from '@fortawesome/free-brands-svg-icons';` |

**6.1 Font Awesome rendering**

> Add a Font Awesome trash can button to a React component.

- Pass: imports `faTrashCan` from `@fortawesome/free-solid-svg-icons` and renders it with `<FontAwesomeIcon icon={faTrashCan} />` from `@fortawesome/react-fontawesome`, not `<faTrashCan />`.

## 7. Errors

**7.1 Unknown provider**

> Search Feather Icons (feather) for a user icon.

- Pass: the tool returns `Unknown provider "feather"`, and the assistant offers a supported library (react-icons has Feather as `set: "fi"`).

## 8. Configuration

These need their own project folder. Make a folder, add the file shown, point the server at it (`claude mcp add ... -e TRUEICON_PROJECT_DIR=<folder> ...`, or `TRUEICON_PROJECT_DIR=<folder> npm run dev:call -- ...`), and repeat the prompt.

**8.1 Pinned version**

`.iconmcp.json`: `{"providers":[{"package":"lucide-react","version":"0.460.0"}]}`

> Which icon libraries are configured, and what's the trash icon?

- Pass: `list_providers` shows only lucide, `version: "0.460.0"`, `source: "iconmcp.json"`, `providersFrom: "iconmcp.json"`; search returns `trash` then `trash-2` at version `0.460.0`.

**8.2 Unsupported package**

`.iconmcp.json`: `{"providers":[{"package":"lucide-react","version":"0.460.0"},{"package":"feather-icons"}]}`

> Find a trash icon.

- Pass: lucide results come back, plus the warning `Skipping feather-icons: not a supported icon provider`.

**8.3 Package with no version**

`.iconmcp.json`: `{"providers":[{"package":"lucide-react"}]}`, with no `package.json` or `node_modules`

> Find a trash icon.

- Pass: no results, with the warning `Skipping lucide: could not determine the lucide-react version (pin it in .iconmcp.json or add it to package.json)`.

**8.4 Invalid JSON**

`.iconmcp.json`: `{"providers":[`

> Find a trash icon.

- Pass: the error names the file: `Invalid JSON in <folder>/.iconmcp.json: …`.

**8.5 No icon packages**

`package.json`: `{"name":"x","dependencies":{"react":"^19"}}`

> Find a trash icon.

- Pass: the error says `No icon packages found in <folder>` and lists the supported packages. Passing a provider explicitly (`provider: "lucide"`) still works.

## 9. Semantic search

Not run in the automated checks. Expected behavior is from the README.

**9.1 Without the model package**

`.iconmcp.json`: `{"providers":[{"package":"lucide-react","version":"0.460.0"}],"semantic":true}`, in a project without `@huggingface/transformers`.

> Find an icon for "remove background".

- Pass: keyword results come back with a one-line warning giving the install command `npm install @huggingface/transformers`. `get_icon` gives the same warning.

**9.2 With the model package**

Same config, after `npm install @huggingface/transformers` in that project.

> Find an icon for "remove background".

- Pass: the first run downloads the model and rebuilds the index; `eraser` ranks near the top. Exact-name queries such as `trash` still put `trash` first.

## 10. Coding tasks

The assistant should call TrueIcon on its own, without being told to. Pass: every import in the code comes from a TrueIcon result, and the build has no missing-export errors.

> Build a settings page header with a back arrow, a search button and a user avatar menu. We use lucide-react.

> Add delete, edit and share actions to this table row. Use MUI icons.

> Make a footer with GitHub, X and LinkedIn links using Font Awesome brand icons.

> Replace every icon in this component with the Phosphor equivalent, bold weight.
