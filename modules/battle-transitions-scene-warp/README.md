# 战斗转场与时空漩涡合并版（Battle Transitions + Scene Warp）

## 中文简介

这是 Foundry VTT V13 使用的合并模组：保留 Battle Transitions 的原有转场功能与宏入口，整合红移／蓝移场景漩涡，并增加电影效果包的管理、导入和扩展能力。它不包含 Madness FX。

### 安装

1. 在本页 Release 下载 `battle-transitions.zip`。
2. 解压后将 `battle-transitions` 文件夹放入 Foundry 用户数据目录的 `Data/modules/`。
3. 在 Foundry 安装所需依赖（`color-picker`、`socketlib`、`lib-wrapper`），重启后在测试世界启用。
4. 不要同时启用独立版“场景时空漩涡转场”，两者共用 `SceneWarpTransitions` 接口。

### 转场资源与边界

- 内置燃烧预设 V4、V5、V6；对应 WebM 素材随模组 ZIP 一同打包，预设使用模组内相对路径，不依赖个人网盘或 COS 地址。
- 已在维护者的测试世界检查预设播放及红移／蓝移基本流程；跨客户端同步、取消／失败后的清理，以及第三方效果包兼容性仍需按实际环境验证。
- 预设管理器、导入格式和公开注册 API 见 [`docs/effect-pack-api.md`](docs/effect-pack-api.md)。扩展包应使用唯一 ID 并附上来源与许可；不要把不可信 JavaScript 导入正式世界。

### 目录说明

`module.js` 与上游 Battle Transitions 主体负责原生转场界面；`scripts/scene-warp/` 提供场景漩涡兼容入口；`scripts/cinematic-presets.js` 管理效果包；`effects/` 保存声明式效果数据；`templates/` 和 `styles/` 是界面文件；`tests/` 是可重复的生命周期与注册表测试；`vendor/`、`greensock/` 保留运行所需第三方库。

新增维护逻辑的关键处附有中文注释。上游压缩代码和第三方库维持原样，以免破坏许可声明或上游映射。

## English reference

> AI-assisted compatibility integration maintained by `Cuujm`. The upstream Battle Transitions code and assets remain credited to their original authors; this is not an official upstream release.

This package keeps the Foundry module ID `battle-transitions`, preserves the Scene Warp transition entry points, and adds the managed cinematic-effect pack interface described in [`docs/effect-pack-api.md`](docs/effect-pack-api.md). It does **not** include Madness FX.

## Compatibility and status

- Targeted at Foundry V13.351.
- Presets include the maintainer-provided burn transitions V4, V5, and V6. Their WebM files are bundled with the module and referenced by module-relative paths.
- V4/V5/V6 and red/blue-shift behavior were exercised in the maintainer's test world. Cross-client synchronization, cancellation/failure cleanup, and arbitrary third-party effect-pack compatibility remain separate test areas; see the repository release notes/issues before relying on them in production.
- This repository contains the upstream preview media required by the transition editor. The custom burn videos themselves remain hosted by the maintainer.

## Install

Use Foundry's Add-on Modules installer with the manifest URL from `module.json`, or extract the `battle-transitions` folder from a release ZIP to `Data/modules/`. Install the listed dependencies through Foundry, restart, and enable the module in a test world first.

## Effect-pack extension points

See [`docs/effect-pack-api.md`](docs/effect-pack-api.md) for the configuration manager, upload/import path, JSON preset format, and public registration API. New packs should use unique IDs and declare their own provenance/license. Never import untrusted JavaScript extensions into a live world.

## Credits and licensing

- Battle Transitions upstream: [Unarekin/FoundryVTT-Battle-Transitions](https://github.com/Unarekin/FoundryVTT-Battle-Transitions), licensed under the included MIT license.
- Upstream artwork/media credits are retained in the upstream project history and assets; see [upstream acknowledgements](https://github.com/Unarekin/FoundryVTT-Battle-Transitions#attributions--acknowledgements).
- Scene Warp integration, V13 compatibility changes, documentation, and test scaffolding were AI-assisted under maintainer direction. See [`AI_ASSISTED.md`](AI_ASSISTED.md).

The upstream README's historical “100% Human-made” statement describes the upstream project only and is not applicable to this AI-assisted derivative. This port does not claim that upstream authors used AI.
