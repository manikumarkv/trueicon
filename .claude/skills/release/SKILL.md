---
name: release
description: Publish a new trueicon version to npm and the official MCP registry, then tag a GitHub release. Use when the user asks to release, publish, ship or bump the version of trueicon, or to publish to npm or the MCP registry.
---

# Release trueicon

A release ships one version to three places, in this order:

1. **npm** as `trueicon`
2. **Official MCP registry** as `io.github.manikumarkv/trueicon`
3. **GitHub** as a `vX.Y.Z` tag and release

The order matters. The MCP registry rejects a version until that exact version is live on npm and its `package.json` has `mcpName` matching the `name` in `server.json`. Versions are immutable on both npm and the registry. Fixing anything after publishing means a new version.

The helper script `.claude/skills/release/release.mjs` does the file edits and checks. Run it from the repo root.

## 1. Prepare the release on a branch

Hooks in this setup block commits to `main`, so work on a branch and merge by PR.

```sh
git switch main && git pull
git switch -c release/vX.Y.Z
node .claude/skills/release/release.mjs bump <patch|minor|major|x.y.z>
node .claude/skills/release/release.mjs check
mcp-publisher validate
npm run lint && npm run typecheck && npm run build && npm test
```

- `bump` sets the version in `package.json`, `package-lock.json` and both version fields in `server.json` (the top-level `version` and the npm package's `version`).
- `check` fails if the versions disagree, `mcpName` doesn't match, the `server.json` description is over 100 characters, or the version is already on npm.

Ask the user which bump to use if they didn't say. Then commit, push, open a PR, wait for CI to pass, and merge it. Publish from the merged `main` so the published code matches git.

## 2. Publish to npm (the user runs this)

The npm account uses a hardware security key for two-factor auth. `npm publish` can only complete the key approval in an interactive terminal. Running it through the Bash tool or the `!` prompt fails with `EOTP`, even with `--auth-type=web`. Don't try. Ask the user to run this in their own terminal:

```sh
cd <repo root> && git switch main && git pull && npm publish
```

`prepublishOnly` rebuilds `dist/` automatically. If `npm whoami` fails, they need `npm login` first. That one does work from the `!` prompt.

## 3. Wait for npm, then publish to the MCP registry

npm answers `202 Accepted` and can take a few minutes before the version is fetchable. Publishing to the registry too early fails with "version not found". Wait first:

```sh
node .claude/skills/release/release.mjs wait-npm
mcp-publisher publish
```

If `mcp-publisher publish` reports an expired or missing login, run `mcp-publisher login github` in the background. Give the user the device code and the https://github.com/login/device URL, wait for it to finish, then publish again. `mcp-publisher` is installed with `brew install mcp-publisher`.

Confirm the listing:

```sh
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.manikumarkv/trueicon"
```

## 4. Tag and release on GitHub

Tag the commit that was published (the merged `main`), then create the release from the tag:

```sh
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --notes "<what changed>"
```

`gh release create --target` needs a full commit SHA or a branch name. A short SHA fails with "target_commitish is invalid", which is why the tag is created first.

## Gotchas

- Pushing changes to `.github/workflows/` needs the `workflow` scope on the `gh` token. If a push is rejected for that reason, have the user run `! gh auth refresh -h github.com -s workflow`.
- The README on npmjs.com only updates when a new version is published.
- The `server.json` description must be 100 characters or fewer. The `package.json` description has no such limit and is longer.
