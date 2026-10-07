# Foundry VTT 原创模组与 AI 协作项目

这是 `Cuujm9800` 主导的 Foundry VTT 原创模组公开仓库。下文以中文介绍模组用途、安装方式、目录结构和维护约定；每个模组目录也提供中文说明。代码、文档及测试中凡由 AI 生成或协助修改的部分，均会明确标注。

这里仅收录为 `Cuujm` 的 Foundry VTT 游戏需求编写的原创模组，以及一个明确标出上游来源的合并扩展。**Warpgate、Magic Items、BaB、合集导出器等版本迁移/兼容移植项目不在此仓库。**

本仓库按模组分别许可，不使用一个根目录许可证覆盖所有文件。每个模组都有独立说明；上游代码、字体和其他素材仍按其原始条款标注。

## 当前发布候选

| 模组 | Foundry ID | 说明 | 状态 |
| --- | --- | --- | --- |
| 中文名（英文名） | Foundry ID | 用途 | 发布说明 |
| --- | --- | --- | --- |
| LA 职业生命骰锁定（LA Hit Dice Lock） | `la-hd-lock` | 将 LA 等级计入角色等级，同时锁住该职业生命骰及普通职业成长 | 已发布；面向 Foundry V13 / D&D5e 5.3.x |
| 私密羊皮纸（Private Parchment） | `private-parchment` | GM 向指定玩家私发文字、图片或视频背景的纸页消息 | 已发布；自定义字体可单独安装 |
| 引爆疯狂视觉效果（Madness FX） | `madness-fx` | 配合宏，在目标玩家端显示随疯狂层数变化的屏幕效果 | 已发布；保留 Cuujm 署名，并注明 Codex、DeepSeek、Claude 协作 |
| 场景时空漩涡转场（Scene Warp Transitions） | `scene-warp-transitions` | 场景切换时播放红移／蓝移漩涡画布特效 | 已发布；不要与下方合并版同时启用 |
| 战斗转场与时空漩涡合并版（Battle Transitions + Scene Warp） | `battle-transitions` | 上游战斗转场、红移／蓝移转场及可管理的电影转场效果包 | 已发布；保留 Unarekin 等上游署名和各自许可 |

懒人包教材初始化器不属于通用原创模组，已从发布范围移除。其他订阅模组、世界导出、合集内容、服务器数据和私有 COS 视频均不打包。

## 仓库结构

```text
modules/                         五个可单独安装的 Foundry 模组
  la-hd-lock/                    LA 职业生命骰锁定
  private-parchment/             私密羊皮纸、背景图、字体及字体许可
  madness-fx/                    疯狂视觉效果与配套宏
  scene-warp-transitions/        独立的场景时空漩涡转场
  battle-transitions-scene-warp/ 上游战斗转场与时空漩涡合并版
tools/                           清单校验与 ZIP 打包脚本
.github/workflows/               自动校验并在版本标签上生成发布 ZIP
```

模组 ID 和目录名用于兼容 Foundry 与现有宏，故保留英文；玩家可见标题和说明提供中文。每个目录内的 `README.md` 说明用途、安装、配置和限制，`AI_ASSISTED.md` 记录 AI 参与，`LICENSE` 与第三方声明说明授权边界。源码中的新增逻辑以中文注释解释关键流程；上游及压缩后的第三方代码不伪造或改写作者注释。

## 下载与安装

每个 GitHub Release 附有独立 ZIP 和中文发布说明。解压后将 ZIP 根目录中的模块文件夹放到 `Foundry Data/modules/`；重启 Foundry，再在目标世界启用。合并转场版和独立 `scene-warp-transitions` 都注册 `SceneWarpTransitions`，请勿在同一世界同时启用。

## 打包与校验

```powershell
./tools/validate-modules.mjs
./tools/package-modules.ps1
```

打包脚本只处理明确列出的模组，不自动打包新目录或私有数据。GitHub Actions 会检查清单引用、AI/许可说明和 JavaScript 语法，并在版本标签上生成 ZIP。

## AI 参与说明

仓库代码、测试脚手架、说明文档及部分视觉资产由 AI 协助生成/修改，需求与迭代由维护者指导。各模块的 AI 声明会重复标注；不能因为 AI 参与而抹去上游作者和第三方素材许可。
