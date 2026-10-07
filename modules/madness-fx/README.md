# Madness FX（引爆疯狂）

由 Cuujm 发起并维护，面向 Foundry VTT V13。模块通过 socketlib 在对应玩家客户端呈现引爆疯狂的屏幕特效；配套宏负责筛选目标、掷伤害、结算疯狂层数，并可按模块设置自动扣血或留给 GM 手动处理。

## 安装

1. 将 `madness-fx` 文件夹放到 Foundry 用户数据目录的 `Data/modules/`。
2. 确保已安装并启用 `socketlib`。
3. 重启 Foundry，在目标世界启用 Madness FX。
4. 将 `detonate-madness-macro.js` 内容导入世界宏，并按需放入快捷栏。

## 使用与设置

在场景中选中目标后运行“引爆疯狂”宏。宏会列出带有相应疯狂效果的目标，允许逐个选择是否引爆及引爆层数。视觉强度随层数变化；模块设置可调整文本、时长、热浪扭曲、震屏、伤害公式、伤害类型和自动扣血行为。

设置位置：游戏设置 → 模组设置 → Madness FX。执行前请先确认目标、效果名称/UUID 与伤害选项符合当前世界规则。关闭视觉总开关不会代替 GM 的规则判断。

## 兼容性

- Foundry VTT：V13（在 13.351 测试）
- 依赖：socketlib
- 当前模块 ID：`madness-fx`

## 许可与署名

本项目代码按本目录 `LICENSE`（MIT）发布。原 V12 模组元数据署名为 **Cuujm**，该署名予以保留。此版本由 Cuujm 指导，使用 Codex、DeepSeek 与 Claude 进行协作开发；详见 `AI_ASSISTED.md`。

