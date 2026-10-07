# 过场效果包平台 API（v1）

合并版保留原有 `new BattleTransition(scene)` 宏，同时提供一个稳定的效果包平台。

## 管理界面

GM 可在 **游戏设置 → 配置设定 → 过场效果包管理** 中：

- 从本机导入声明式 JSON 效果包；
- 添加 JSON 直链并检查更新；
- 启用、停用或删除网址源；
- 使用 Foundry 自带文件管理器上传/选择 WebM、图片和音频；
- 查看由其他模组通过 API 注册的效果包。

JSON 包只保存 Battle Transitions 的 `sequence` 数据，不执行 JavaScript。带代码的 shader、PIXI 或 HTML 转场应做成普通 Foundry 模组，再调用下述 API。这样更新来源可追踪，也不会从任意网址执行代码。

## 声明式 JSON 包

```json
{
  "schemaVersion": 1,
  "id": "example.campaign-transitions",
  "label": "战役转场包",
  "description": "本战役使用的 WebM 与序列预设。",
  "version": "1.0.0",
  "homepage": "https://example.com/pack",
  "presets": [
    {
      "id": "example.flame",
      "label": "火焰燃烧",
      "description": "两秒全屏燃烧转场。",
      "sequence": []
    }
  ]
}
```

同一个直链更新 `version` 和内容后，GM 点击“检查更新”即可载入新版。包 ID 与预设 ID 必须稳定；不同来源不能覆盖彼此已经注册的 ID。

## 供其他模组调用

```js
Hooks.once("ready", async () => {
  const platform = game.modules.get("battle-transitions")?.api?.effectPacks;
  await platform?.ready;

  platform.registerEffectPack({
    id: "my-module.transitions",
    label: "My Module Transitions",
    version: "1.0.0",
    presets: [
      {
        id: "my-module.video",
        label: "My Video",
        sequence: [/* BattleTransition steps */]
      }
    ],
    transitions: [
      {
        id: "my-module.shader",
        label: "My Shader",
        description: "A code-driven scene transition.",
        createClientEffect: ({ overlay, payload }) => ({
          attach(stage) {},
          setProgress(progress, phase) {},
          destroy() {}
        })
      }
    ]
  }, {
    owner: "my-module",
    sourceType: "module"
  });
});
```

公开入口：

- `game.modules.get("battle-transitions").api.effectPacks`
- `globalThis.CinematicTransitions`
- `globalThis.SceneWarpTransitions`

效果包 API 包含 `registerEffectPack`、`unregisterEffectPack`、`registerBattlePreset`、`runBattlePreset`、`listEffectPacks`、`refreshEffectPacks` 和 `openManager`。

Scene Warp API 包含 `registerTransition`、`unregisterTransition`、`unregisterByPack`、`transitionTo`、`openDialog` 与 `listTransitions`。

## 兼容保证

- 模组 ID 仍为 `battle-transitions`。
- 原 `BattleTransition` 全局类和旧宏调用方式不变。
- 原 Scene Warp 全局入口 `SceneWarpTransitions` 保留。
- 内置效果文件仍可读取，但不再要求用户手工修改模块目录清单。

