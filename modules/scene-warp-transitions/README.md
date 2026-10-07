# 场景时空漩涡转场（Foundry VTT V12–V14）

这是由 `Cuujm` 指导、AI 协助编写的原创模组；详见 [`AI_ASSISTED.md`](AI_ASSISTED.md)。

这是一个兼容 **Foundry VTT V12、V13、V14** 的小模组。GM 执行宏后选择目标场景；所有已连接客户端会先看到当前画布持续卷入漩涡，随后旧场景在漩涡中红移、径向拉扯并缩向远端。目标场景从同一涡核中带轻微蓝移出现、反向解扭、放大并恢复正常。

它不依赖 D&D5e 版本，也**不调用** Sequencer、Battle Transitions 或 Better Transitions 的内部 API，因此可以和它们同时启用。V12 使用 PIXI 7 Filter 路径；V13–V14 自动切换至 PIXI 8 与 DialogV2 路径。使用画布级 PIXI Shader 的原因是：它可以扭曲实际画布，而不是播放一段盖在地图上的 WebM。

## 安装

1. 解压本模组到 `FoundryVTT/Data/modules/scene-warp-transitions/`。
2. 进入世界的“管理模组”，启用“Scene Warp Transitions / 场景时空漩涡转场”。所有要观看转场的用户都应在这个世界中加载该模组。
3. 创建一个“脚本宏”，粘贴下面内容：

```js
SceneWarpTransitions.openDialog();
```

4. GM 在当前场景执行宏，选择目标场景与预设，点击“开始转场”。

## 现有预设

- **时空漩涡（红移）**：默认预设。总时长默认 4.5 秒，其中约 58% 是旧场景的持续漩涡与红移缩远；目标场景随后从同一核心带轻微蓝移反向解扭。黑场仅用来遮住 Canvas 实例更换的单帧，不是转场主体。
- **黑场淡入淡出**：基础预设，用于较稳妥的切场景或验证模块通信。

“强制切到目标场景”默认开启。它会让各客户端在转场中调用目标场景的 `view()`，同时发起 GM 会调用 `Scene.activate()`，使目标成为全世界的激活场景。

## 扩展接口

模组在 `ready` 后暴露：

```js
SceneWarpTransitions.registerTransition("my-transition", {
  label: "我的转场",
  description: "显示在选择框中的说明",
  createClientEffect: ({ overlay, payload }) => ({
    attach(stage) {
      // 可选：把自己的 PIXI Filter 加到 stage。
    },
    setProgress(progress) {
      // progress: 0 为正常画面，1 为场景间的完全遮罩。
      overlay.root.style.setProperty("--swt-blackout", String(progress));
    },
    destroy() {
      // 清理 Filter、DOM、音频等资源。
    }
  })
});
```

注册后，它会自动出现在宏的“转场预设”下拉框中。以后增加分割、百叶窗、纯淡白等效果不需要重写场景选择和多人同步部分。

## 已知边界

- 这是“场景切换”转场，发起人必须是 GM。
- 切场景本身取决于每位用户的网络和地图资源加载速度；模组会用黑场桥接加载期，避免把空白 Canvas 直接暴露出来。
- 若有其他模组在同一时刻修改 `canvas.stage.filters`，可能与漩涡预设发生视觉冲突。此时可选择“黑场淡入淡出”预设排查。
