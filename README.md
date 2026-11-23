# Factory Droid for Ekko Studio

This independent integration runs Factory Droid in a Studio chat with Factory's native models or a Studio-selected model. The plugin ID and local Agent ID are both `factory-droid`. Studio registers `plugin:factory-droid/factory-droid`.

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

Both modes run in the selected workspace and show Studio prompts for tool permissions requested by the CLI. Approval authorizes only one use. The plugin passes Studio's per-turn MCP bindings to the CLI, where support depends on the transport and Droid version. Images and files are capped at 8 MiB combined. Scoped file input accepts UTF-8 text and PDF, and image input accepts PNG, JPEG, GIF and WebP. Global uses ACP-negotiated input capabilities.

Global follow-up turns can load the previous native session while the Studio Agent instance is alive. Scoped turns use authorized Studio history and a fresh native session. After a Studio restart, Global can also use Studio history. The plugin declares `resume: false`.

## Manage native configuration

Open **Agent Management → Factory Droid → Settings** as the activating Studio account in the activating Profile. The Skills page provides a searchable list and file preview. The MCP page provides searchable server cards, status switches and a masked configuration viewer. The configuration page shows engine status and two separately saved settings editors. Each page shows the relevant personal location on the Studio server.

| Page | File | Actions |
| --- | --- | --- |
| **Skills** | `~/.factory/skills/<name>/SKILL.md` | Edit the description, Markdown and personal enabled state while retaining extra YAML fields. The editor and switch write `disabledSkills` to the personal local override when it defines the key, or to personal defaults otherwise. Frontmatter and project rules can also disable a skill. Deletion removes the entry point and clears that name from both personal disable lists. Supporting files remain. A new Skill is enabled by default. [Factory Skills](https://docs.factory.com/harness/skills) |
| **MCP servers** | `~/.factory/mcp.json` | View, add, edit, enable, disable or remove a personal server. Replace its full transport configuration to switch between `stdio`, `http` and `sse` under the same name. Omit optional fields to remove them. Saved URLs, arguments and credentials are masked when opened. Keep `null` placeholders to retain matching stored fields, and supply new credentials for a new endpoint. An incomplete or unsupported server is counted as unavailable and cannot be toggled. [Factory MCP](https://docs.factory.com/harness/mcp) |
| **Droid settings** | `~/.factory/settings.json`, `~/.factory/settings.local.json` | Edit `model`, `reasoningEffort`, `disabledSkills`, `blockOnMcpLoad` and `streamAssistantResponses` in the chosen layer. Omit a supported key to clear it from that layer. Other keys, including custom model and authentication settings, are preserved. [Factory settings](https://docs.factory.com/droid-cli/settings) |

Global launches use this personal home. Native local or project settings can override personal defaults. A model explicitly selected for the Studio chat takes precedence when the plugin requests it. Start a new chat to check an MCP or Skill change in a fresh native session.

Scoped launches use a disposable private home and the authorized Studio model. They leave the Global personal files untouched. Droid can still discover native project resources in the selected workspace, which remain editable through Droid or a workspace editor. These Studio settings pages have no bound session workspace. The pages leave organization policies, OAuth login and connectivity testing to Droid. [Factory settings precedence](https://docs.factory.com/enterprise/hierarchical-settings-and-org-control)

The editor accepts UTF-8 files up to 256 KiB and uses strict JSON for settings and MCP. It rejects symlinked configuration paths. A stale edit requires a reload before saving. With official Droid 1.17.2 on macOS arm64, native project MCP connected in an isolated scoped test. An additional server provided through the SDK's per-turn MCP input did not appear in that test. Signed-in Global ACP configuration loading and Linux and Windows behavior still need verification.

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

The plugin code uses the [MIT License](LICENSE). The icon identifies the Factory Droid engine used by this integration. The Droid artwork comes from [Factory's Zed extension](https://github.com/Factory-AI/factory-zed-extension/blob/6a5d674f5e106d63ff25346c3d1e607db525e2f0/droid-zed.svg) and is distributed under [Apache-2.0](assets/FACTORY-DROID-LICENSE). The [artwork notice](assets/FACTORY-DROID-NOTICE) records the PNG adaptation and the source of the mark.

The bundled Studio SDK retains its [license](sdk/LICENSE) and [notices](sdk/NOTICE). The official Droid CLI is distributed separately by Factory under [Factory's terms](https://factory.ai/legal/terms).

The settings layout adapts the MIT-licensed [Ekko Studio Cline plugin](https://github.com/EKKOLearnAI/ekko-studio-plugin-cline). The bundled YAML parser retains its [license](assets/YAML-LICENSE).
