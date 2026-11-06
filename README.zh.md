# dsh-skill-hub

[中文](README.zh.md) · [English](README.md)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的图形化中枢：查看和编辑指令文件与技能、管理技能来源和 MCP 服务器、排查发现问题，并查看 Token 数与调用统计。

本项目 Fork 自 [cheshireez/dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub)。**本 Fork 通过 GitHub 分发；npm 上的 `dsh-skill-hub` 是上游版本。**

## 兼容性

已验证：DSH 0.2.2-rc.1（源码与自动化检查）；尚未完成 Desktop 实测。

## 安装

要求 Node `^22.19 || >=24`。

在 DSH Desktop 打开 **插件 → 添加 → Git 仓库**：

```text
https://github.com/iBobbyTS/dsh-custom-instruction-manager.git
```

Git 安装直接使用仓库内预构建的 `lib/`，安装期间不编译插件。按提示重启对应 Host，然后打开 **侧边栏 → 其他插件**；配置位于 **插件** 中本插件的页面。只保留一份安装，避免重复注册。

## 使用与文档

- 浏览本地技能目录，打开技能查看或编辑；用 **市场 → 扫描 → 导入** 添加技能。
- 指令与 MCP 页面展示支持的文件和运行中的服务器配置，通过 DSH 扩展接口执行修改。
- [使用指南、API 与故障排查](docs/guide.zh.md) · [English guide](docs/guide.md)
- [开发设置与验证](CONTRIBUTING.md) · [开发规范](https://github.com/iBobbyTS/dsh-custom-instruction-manager/blob/main/AGENTS.md)

更新检查只查询本 Fork 的 GitHub release；尚无 release 时，不将上游版本推荐为本 Fork 更新。

Fork 问题请提交到 [iBobbyTS/dsh-custom-instruction-manager](https://github.com/iBobbyTS/dsh-custom-instruction-manager/issues)。[上游讨论区](https://github.com/cheshireez/dsh-skill-hub/discussions) 保留作原项目参考。

[MIT](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)。
