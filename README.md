# dsh-skill-hub

[中文](README.zh.md) · [English](README.md)

A GUI hub for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): browse and edit instruction files and skills, manage skill sources and MCP servers, inspect discovery problems, and view token and invocation counts.

This is a fork of [cheshireez/dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub). **This fork is distributed from GitHub; the npm package `dsh-skill-hub` is the upstream release.**

## Install

Requires Node `^22.19 || >=24` and DSH web `>=0.1.7-alpha.1 <0.3`.

In DSH Desktop, open **Plugins → Add → Git repository**:

```text
https://github.com/iBobbyTS/dsh-custom-instruction-manager.git
```

Git installation runs this repository's `prepare` script to build `lib/`. Restart the corresponding Host when prompted, then open **sidebar → Other Plugins**. Configuration is on this plugin's page in **Plugins**. Keep one installation to avoid duplicate registration.

## Use and documentation

- Browse the local skill catalog, open a skill to inspect or edit it, or use **Market → Scan → Import** to add skills.
- The instruction and MCP pages expose the supported files and running server configuration; changes use DSH's extension APIs.
- [User guide, API and troubleshooting](docs/guide.md) · [中文指南](docs/guide.zh.md)
- [Development setup and checks](CONTRIBUTING.md) · [Development rules](https://github.com/iBobbyTS/dsh-custom-instruction-manager/blob/main/AGENTS.md)

Update checks refer to this fork's GitHub releases. A missing fork release is not an upstream update.

Report fork issues at [iBobbyTS/dsh-custom-instruction-manager](https://github.com/iBobbyTS/dsh-custom-instruction-manager/issues). [Upstream discussions](https://github.com/cheshireez/dsh-skill-hub/discussions) remain a reference for the original project.

[MIT](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md).
