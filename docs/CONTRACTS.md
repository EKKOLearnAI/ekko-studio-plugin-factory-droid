# Factory Droid runtime contract

The plugin registers Studio Agent API v1 in `apply(ctx)`. Both stable IDs are `factory-droid`. It declares `chat`, streaming, Global and scoped modes, and `resume: false`. Studio host types are in `sdk/src/agents.ts`.

## Engine management

The activating account and Profile are the only management callers. Studio checks the expected installed version and prevents maintenance during runs. The plugin serializes writes, validates versions itself, and tracks selection in `droid-engine/current.json` under the plugin's data directory. Selection is atomically replaced after a staged install passes checks. An absent selection permits discovery of an external CLI. An empty selection denotes removal and keeps automatic PATH discovery from immediately changing the removed status. Setting an explicit external executable overrides either managed state.

The official npm wrapper `droid` lists exact versions of the native packages in its optional dependencies. Check-update reads the public stable version and verifies the matching native package. The managed installation fetches the exact native package from npm with scripts disabled and isolated npm configuration. ARM64 uses the corresponding platform package and x64 uses Factory's baseline variant so AVX2 is optional. Only the cumulative external search reads host paths. The managed selector and binary paths are checked to stay inside their release directory. Before selection the binary must report the requested version and negotiate ACP as `@factory/cli` in a disposable home. Updates keep the preceding installation active until that check succeeds. Deletion removes the selected managed release and preserves user configuration and native sessions.

An absolute `EKKO_FACTORY_DROID_EXECUTABLE` gets priority, followed by an explicit managed selection, then discovery on PATH and standard user bin directories. On Windows, the plugin can resolve the official npm package's native `droid.exe` directly without running its shell shim. An invalid explicit override remains externally managed. External installations never enter the plugin's update or removal flow.

## Global mode

The activating Studio account and Profile own the host OS user's native Factory config and login. Global catalog discovery and each chat launch use the [ACP Registry](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json) arguments `exec --output-format acp-daemon` and its two environment variables disabling auto-update. Model discovery reads ACP authentication status and uses the engine's native model list. Output and errors are sanitized by the plugin.

The live Studio Agent instance retains the previous successful native session ID only while the executable and canonical workspace match. If negotiated, `session/load` loads it with current MCP bindings and replay output is ignored. A fresh session receives authorized Studio conversation history as context. In-flight or cancelled turns clear the continuation reference. The plugin uses no Studio checkpoint.

## Scoped mode

The turn is bound to the real caller's Studio session, model and lease. Only the Chat Completions protocol is advertised to Studio. An isolated Droid home contains a single per-turn BYOK entry using Factory's `generic-chat-completion-api` provider. The per-turn mode uses the official local SDK JSON-RPC transport, verified with Droid 1.17.2. The ACP transport in that build requires Factory sign-in at session creation, even when pointed at a custom model.

The isolated Droid process receives a random loopback key, a private home, and the selected workspace. It does not get the Factory account key, the Studio proxy lease credential, or host Droid settings. The local relay checks the incoming key, endpoint and exact model ID, adds Studio's lease credential, and forwards the authorized model request. The plugin requires the native session to confirm the selected model and receive a successful Studio model response. Studio manages upstream authentication and usage. Run cleanup closes the process and relay and removes the private configuration and session files. Scoped uses authorized Studio history rather than a persistent Droid session ID.

## Native configuration pages

The manifest registers `skills`, `mcp`, and `settings` in the `agent-settings` slot. `management.settings` returns `{ viewId: 'skills' }`. The activation account and Profile must match the caller on routing and on each RPC. The editor and the Global catalog and chat use the same host user home. Global sets `FACTORY_HOME_OVERRIDE` explicitly. Scoped supplies its own temporary home.

The RPCs declared in `contracts/plugin.json` take a resource and, for Skill or MCP documents, an entry name. `list-native-config` returns the supported names. `read-native-config` returns the native path, projected editor text, existence flag and backing-file revision. `save-native-config` and `remove-native-config` require that revision. Writes serialize within the plugin process and replace JSON and Markdown atomically. Only a skill's `SKILL.md` or a single MCP entry can be removed. The plugin uses the existing native files without a migration or a separate Studio copy.

The settings RPCs use fixed names beneath the canonical OS home and reject linked configuration directories and files. JSON edits preserve unexposed keys and unrelated entries. In the MCP editor, omission of an optional field preserves it. A `null` placeholder retains an existing hidden value. Replacing an entire headers or environment object can remove individual keys by omission. The editor handles personal files only. A project editor would need a host-validated workspace identity for each settings request.

## Inputs, permissions and cancellation

The plugin validates the Studio account, Profile, session and mode before a turn. It reads attachments via Studio's authorized attachment APIs. ACP uses negotiated image and embedded resource blocks. The scoped SDK transport uses text/image content and native UTF-8 text or PDF document blocks. The plugin transmits the current run's MCP configuration. Raw tool inputs, complete tool responses, native stderr and RPC error messages stay outside Studio events.

Global ACP approval maps explicit Studio approval to `allow_once` and denial to `reject_once` when available. Scoped maps explicit approval to an offered `proceed_once`; rejection or unavailability returns `cancel`. Other choices cannot persist permission. Tool information passed for display is limited to sanitized fields. App cancellation sends `session/cancel` in Global and `droid.interrupt_session` in scoped mode, cancels pending permissions and suppresses late output. Both transports provide one final result and stream deltas as previews.

## SDK reference and verification

- [Factory local SDK](https://docs.factory.com/sdk/typescript)
- [Factory custom models](https://docs.factory.com/model-independence/byok)
- [Droid CLI reference](https://docs.factory.com/droid-cli/cli-reference)

Run the checked-in fixtures with `npm test`. Set `EKKO_FACTORY_DROID_NATIVE_TEST_CLI` to an official Droid 1.17.2 executable to include real CLI checks. The optional test uses a short POSIX shell command for the approval probe. The isolated scope uses a synthetic local Chat Completions endpoint for verification.
