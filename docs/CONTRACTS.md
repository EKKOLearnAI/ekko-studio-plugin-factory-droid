# Factory Droid runtime contract

The plugin registers Studio Agent API v1 in `apply(ctx)`. Both IDs remain `factory-droid`. The declaration exposes the `chat` surface, `global` mode, and streaming. The plugin stores no configuration, account credentials, or checkpoints. See `contracts/plugin.json` for the contract inventory and `sdk/src/agents.ts` for Studio host types.

## Engine and identity

The Studio host supplies the executable through its environment or PATH. The version probe runs `droid --version`. The ACP launch uses `exec --output-format acp-daemon` with `DROID_DISABLE_AUTO_UPDATE=true` and `FACTORY_DROID_AUTO_UPDATE_ENABLED=false`, matching the [ACP Registry](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json) entry for `droid@1.17.2`. Launch always uses a structured argument array and the active workspace. The subprocess inherits the OS environment needed for Droid configuration and execution, including `FACTORY_API_KEY` if set. Studio proxy credentials and unrelated environment variables are excluded.

The activating Studio user and Profile own the native login. Agent runs validate the current identity, mode, and Studio session before opening the engine. Model discovery uses a disposable working directory, checks ACP authentication status when advertised, and reads the native model and select options from a new ACP session. The plugin returns a sanitized authentication message or status when the CLI requests login. A supported explicit model or reasoning selection is applied before sending a prompt.

## Turn lifecycle

Each run opens a separate ACP daemon client. The first run or a run following a failure sends `session/new`. After a successful turn the live Studio Agent instance retains the native session ID, executable, canonical workspace path, and requested model options. The next turn tries `session/load` only when the engine advertises `loadSession` and the executable and workspace still match. Replay updates are ignored. A fresh session receives authorized conversation history as context. In-flight and cancelled turns never advance the native continuation ID. The plugin declares `resume: false` and omits the host checkpoint hook.

Studio text and instructions become ACP text blocks. Images carry image bytes, and file data is passed as inline ACP resources. The attachment URI labels the asset without exposing a local file path. Attachment scope is enforced by the host read and resolve APIs. Unsupported negotiated capabilities or excess size fail before prompting. Studio MCP transports are passed anew with each session setup. The plugin does not persist or log them.

Only the live native session's ACP messages contribute to the current run. Text chunks accumulate into one final response. Tool updates use sanitized kind and status fields and pair starts with completion or failure. Raw tool inputs and results, CLI stderr, and native RPC error messages are never forwarded by the plugin. Permission details use Droid's display title with common credential forms and the configured Factory key redacted.

For `session/request_permission`, only explicit Studio approval selects an offered `allow_once`. Explicit denial selects a single offered `reject_once` or returns `cancelled` if no unambiguous one-time rejection exists. Timeout, cancellation, missing/invalid options, failed interaction, and mismatched session all return `cancelled`. Cancelling an active turn sends `session/cancel` to its native ID, settles pending permissions, suppresses late output, and closes the daemon transport. Deadline and instance disposal use the same cleanup path.
