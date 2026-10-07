# Private Parchment / 私密羊皮纸

AI-assisted original module directed by `Cuujm`; see [`AI_ASSISTED.md`](AI_ASSISTED.md) and [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

## 安装

1. 将整个 `private-parchment` 文件夹放入 Foundry 用户数据目录的 `Data/modules/`。
2. 重启 Foundry。
3. 在世界的“管理模组”中启用 `Private Parchment / 私密羊皮纸`。
4. 创建一个“脚本”宏，内容如下：

```js
game.modules.get("private-parchment")?.api?.openComposer();
```

## 兼容版本

支持 Foundry VTT V12、V13、V14。

## 使用

GM 执行宏后可以：

- 输入或粘贴多行文本；
- 选择一个或多个非 GM 用户；
- 选择字体、字号和文字颜色；
- 设置自动关闭时间；
- 使用静态图片或 WebM 作为背景；
- 向已选择玩家发送清除指令。

只有 payload 中被选择的客户端会在本地创建浮层，其他玩家不会收到可见内容。

默认背景路径：

```text
modules/private-parchment/assets/parchment.png
```

如果要使用自己的 FVTT 文件路径或 COS 地址，直接在发送窗口的背景路径栏替换即可。

## 注意

- 玩家必须处于在线状态，才能实时收到消息。
- 模组必须在世界中启用；无需玩家手动运行接收宏。
- 远程图片或 WebM 必须允许浏览器公开读取。

## 安装自定义字体

把字体文件复制到：

```text
Data/modules/private-parchment/fonts/custom/
```

支持：

```text
.ttf
.otf
.woff
.woff2
```

中英文字体使用方式相同。复制后重启 Foundry，或在发送窗口点击字体右侧的
刷新按钮。字体会按文件名显示在“自定义字体”分组中。

例如：

```text
fonts/custom/霞鹜文楷.ttf
fonts/custom/GreatVibes-Regular.woff2
```

如果服务器不允许 FilePicker 自动列出目录，可以编辑：

```text
fonts/custom/fonts.json
```

格式：

```json
[
  {
    "file": "霞鹜文楷.ttf",
    "label": "霞鹜文楷"
  },
  {
    "file": "GreatVibes-Regular.woff2",
    "label": "Great Vibes"
  }
]
```

字体会通过模组路径发送给玩家浏览器，玩家电脑不需要预先安装。
