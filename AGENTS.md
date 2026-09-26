# Zotero BabelDOC Build Contract

## Scope

This repository builds a Zotero 10 plugin that launches a local, isolated
BabelDOC process. The plugin never uploads PDFs to a project server and never
modifies a user's unrelated BabelDOC installation.

## Pinned runtime

- Plugin version: `0.1.12`
- Zotero: `10.*`
- Node.js CI: `22`
- pnpm CI: `11`
- uv: `0.12.13`
- Python: `3.12.13`
- BabelDOC: `0.6.4`
- Runtime ID: `babeldoc-0.6.4-python-3.12.13-lock-v1`
- Dependency source: `runtime/pyproject.toml`
- Resolver lock: `runtime/uv.lock`
- Deployment lock with hashes: `runtime/requirements.lock`
- Build entry point: `pnpm run build`
- XPI output: `.scaffold/build/*.xpi`

The lock was generated with uv 0.12.13. It contains the complete BabelDOC
dependency graph, platform markers, and SHA-256 hashes. `src/modules/runtimeLock.ts`
is generated from `runtime/requirements.lock` during the build and must not be
edited manually.

## Runtime layout

The plugin-managed root is `~/.babeldoc-translator/` on all platforms. uv is
stored under `uv/<uv-version>/`; virtual environments are stored under
`runtimes/runtime-<runtime-id>-<deployment>/venv/`; `active-runtime.json`
points to the last fully validated environment. User-global uv/Python/BabelDOC
installations are never modified.

## Deployment behavior

Startup and translation only detect the active runtime. Installation happens
only from the Preferences pane after the user clicks the deployment button.
Deployment uses the embedded hash-locked requirements, validates the exact
BabelDOC version, writes the active manifest only after validation succeeds,
and then removes unused old runtimes. A runtime held by an active translation
task is retained until that task releases it.

## Updating the runtime

When changing BabelDOC, Python, or uv, update `package.json`,
`runtime/pyproject.toml`, regenerate `runtime/uv.lock` and
`runtime/requirements.lock` with the pinned uv, then run the build. The
runtime ID must change for every incompatible runtime change. CI must pass on
Ubuntu x86_64, macOS arm64, and Windows x86_64 before release.

The build workflow publishes tagged `v*` builds as GitHub Releases. The
monthly upstream check creates one open issue when a newer Zotero major or
BabelDOC release needs review.

Commands:

```bash
uv lock --directory runtime
uv export --directory runtime --locked --format requirements-txt --no-dev --output-file runtime/requirements.lock
pnpm run python-lock:embed
pnpm run build
```

## API test semantics

The Preferences API button is intentionally a lightweight reachability check:
it requests `/models` and reports whether an HTTP response was received. It
does not claim that the API key or selected model is valid and must not make a
billable model-completion request.
