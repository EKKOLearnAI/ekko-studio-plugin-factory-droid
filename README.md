# Factory Droid for Ekko Studio

Run Factory Droid in a Studio chat using the official Droid CLI and its native model catalog. The plugin ID and local Agent ID are both `factory-droid`. Studio registers `plugin:factory-droid/factory-droid`.

## Install

1. On the machine that runs Studio, install the Droid version listed in the [ACP Registry](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json). This plugin was tested with `1.17.2`.

   ```sh
   npm install -g droid@1.17.2
   droid --version
   ```

   See the [Factory CLI quickstart](https://docs.factory.com/droid-cli/quickstart) for other installation methods. Studio looks for `droid` on its server PATH, then under `~/.local/bin` and `~/.factory/bin`. Set `EKKO_FACTORY_DROID_EXECUTABLE` in the Studio server environment to select a specific absolute executable path. On Windows, point at the native `droid.exe` if npm only placed a command shim on PATH. The native npm binary is in the corresponding `@factory/cli-win32-x64` or `@factory/cli-win32-arm64` installation under `bin`. Restart the Studio server to apply environment changes.
2. Run `droid` and complete Factory sign-in as the OS user running Studio. For headless use, set `FACTORY_API_KEY` with the Studio server's secret configuration. See [Factory authentication](https://docs.factory.com/droid-exec/overview#installation).
3. In Studio's **Plugin Center**, use **Install from source**, enter the source below, then enable it. For a fixed install, append `#<40-character-commit>`. For local use, enter the absolute path of the plugin checkout.

   ```text
   github:EKKOLearnAI/ekko-studio-plugin-factory-droid
   ```
4. In **Agent Management**, confirm Factory Droid shows an installed CLI version. Start a single chat with Factory Droid in **Global** mode and select a model from Droid's catalog, or use its native default when Studio offers it.

## Behavior

- Droid runs in the workspace selected in Studio. Only the Studio user and Profile that enabled the plugin can use that host's native Droid login and model configuration.
- Studio shows a permission prompt when the CLI requests an option it can approve for one use. Review the tool description and choose whether to allow it. The plugin does not pass autonomy or permission bypass flags. Droid's own rules continue to govern tools that it handles without asking Studio.
- Images and file contents are sent as ACP attachments, subject to the negotiated capabilities and an 8 MiB total attachment limit per turn. Studio MCP servers are passed to Droid when the required transports are available.
- Stop sends a cancellation for the active native session. Follow-up turns can load the previous native session while the Studio Agent instance is alive. When native loading is unavailable or the instance is recreated, Studio conversation history is provided to a new native session. Native session recovery across Studio restarts is not advertised.
- Version `0.1.0` provides Global single chat and streaming. Engine installation, login, and native configuration are handled by the Droid CLI.

## Develop and test

Use Node.js 24.2 or a newer 24.x version.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run harness:check
npm test
npm pack --dry-run --ignore-scripts
```

Tests use a local ACP fixture. For the optional official 1.17.2 binary check, set `EKKO_FACTORY_DROID_NATIVE_TEST_CLI` to its absolute executable path before running `npm test`. The check uses a disposable CLI home and verifies the unconfigured login state. To verify a signed-in CLI, use a separate Studio instance and a temporary workspace. Try a benign prompt, a follow-up requiring earlier context, a tool operation that Droid is configured to ask about, and Stop during an active turn. Record the CLI version and platform along with the outcomes.

See [the runtime contract](docs/CONTRACTS.md) and [the SDK development guide](docs/DEVELOPMENT.md).

## License

The plugin and its original icon use the [MIT License](LICENSE). The bundled Studio SDK retains its [license](sdk/LICENSE) and [notices](sdk/NOTICE). The official Droid CLI is distributed separately by Factory under [Factory's terms](https://factory.ai/legal/terms).
