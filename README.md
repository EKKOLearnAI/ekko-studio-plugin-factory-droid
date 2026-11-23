# Factory Droid for Ekko Studio

Run Factory Droid in a Studio chat with Factory's native models or a Studio-selected model. The plugin ID and local Agent ID are both `factory-droid`. Studio registers `plugin:factory-droid/factory-droid`.

## Install

1. In Studio's **Plugin Center**, use **Install from source** and enable the plugin. For a local candidate, enter the absolute checkout path. For a GitHub installation, use a commit that contains the desired version.

   ```text
   github:EKKOLearnAI/ekko-studio-plugin-factory-droid#<40-character-commit>
   ```
2. As the Studio super administrator who enabled the plugin, open **Agent Management → Factory Droid → Install**. Studio needs Node.js with npm, access to the public npm registry, and disk space for the package and its staging directory. Factory publishes macOS, Linux, and Windows builds for ARM64 and x64. Studio verifies the downloaded binary and its ACP handshake before selecting it.
3. Use **Check update** to discover the current stable release or **Delete** to remove the selected managed package. Factory configuration, login and session data are stored separately. An external installation can be chosen explicitly after removal.

### External CLI

An existing external Droid is detected on the Studio host PATH and in standard user bin directories. Install it with `npm install -g droid@1.17.2` or follow the [Factory CLI quickstart](https://docs.factory.com/droid-cli/quickstart). Set `EKKO_FACTORY_DROID_EXECUTABLE` in the Studio server environment to select an absolute executable path. On Windows use `droid.exe`. Recognized Windows npm layouts resolve to the native binary. Apply server environment changes by restarting Studio. Updates and deletion for an external CLI belong to its installer. The current Studio card can still display Delete and the backend rejects that action for external binaries.

## Chat modes

| Mode | Model selection and credentials |
| --- | --- |
| **Global** | Uses the native Droid model catalog and settings of the system account running Studio via the ACP Registry's `acp-daemon` launch. Sign in to Droid under that account or supply `FACTORY_API_KEY` through the Studio server's secret configuration. Only the activating Studio account and Profile may use this mode. |
| **Model (scoped)** | Uses the current Studio account and Profile's authorized model through the Studio model proxy. The official Droid SDK's local `stream-jsonrpc` transport runs with a temporary BYOK configuration. The verified engine runs this path without Factory sign-in. Choose a Studio binding with a Chat Completions route. Studio can translate that route to a configured upstream protocol. |

With a managed CLI, a Factory API key on the Studio server is the direct headless setup for Global. A native CLI already signed in under that same OS user supplies session credentials to the managed binary. See [Factory authentication](https://docs.factory.com/droid-exec/overview#installation).

Both modes run in the selected workspace and show Studio prompts for tool permissions requested by the CLI. Approval authorizes only one use. Supported MCP transports are forwarded per turn. Images and files are capped at 8 MiB combined. Scoped file input accepts UTF-8 text and PDF, and image input accepts PNG, JPEG, GIF and WebP. Global uses ACP-negotiated input capabilities.

Global follow-up turns can load the previous native session while the Studio Agent instance is alive. Scoped turns use authorized Studio history and a fresh native session. After a Studio restart, Global can also use Studio history. The plugin declares `resume: false`.

## Develop and test

Use Node.js 24.2 or a newer 24.x version.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run harness:check
npm test
npm pack --dry-run --ignore-scripts
```

Tests use a local ACP fixture. For the optional official 1.17.2 binary check, set `EKKO_FACTORY_DROID_NATIVE_TEST_CLI` to its absolute executable path before running `npm test`. The native checks use disposable CLI homes. They verify the Global login gate and make scoped requests, including a tool approval, through a synthetic loopback model. To verify a signed-in CLI, use a separate Studio instance and a temporary workspace. Try a benign prompt, a follow-up requiring earlier context, a tool operation that Droid is configured to ask about, and Stop during an active turn. Record the CLI version and platform along with the outcomes.

See [the runtime contract](docs/CONTRACTS.md) and [the SDK development guide](docs/DEVELOPMENT.md).

## License

The plugin and its original factory-building icon use the [MIT License](LICENSE). The icon identifies the Ekko Studio integration. Factory's own brand mark appears in its documentation logo and in the Droid entry in the ACP Registry. [Factory logo](https://github.com/Factory-AI/factory/blob/main/docs/logo/light.svg) · [ACP Registry icon](https://github.com/agentclientprotocol/registry/blob/main/factory-droid/icon.svg)

The bundled Studio SDK retains its [license](sdk/LICENSE) and [notices](sdk/NOTICE). The official Droid CLI is distributed separately by Factory under [Factory's terms](https://factory.ai/legal/terms).
