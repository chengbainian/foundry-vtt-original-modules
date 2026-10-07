# LA 职业生命骰锁定（LA Hit Dice Lock）

> 本说明以中文为主；English: see the sections below for compatibility details and API examples.

AI-assisted original module created under `Cuujm`'s direction. See [`AI_ASSISTED.md`](AI_ASSISTED.md) for provenance.

## 用途

For D&D5e 5.3.x, treats a class named `LA` as a Level Adjustment class: its levels still count toward character level and proficiency bonus, but its hit dice remain unavailable. The module also avoids granting ordinary class advancement from that class.

适用于 D&D5e 5.3.x：将名为 `LA` 的职业视作等级调整（Level Adjustment）。该职业等级仍计入角色总等级和熟练加值，但不提供可用生命骰，也不授予普通职业升级内容。

## 安装与配置

1. Put the `la-hd-lock` folder in Foundry's `Data/modules/` directory.
2. Restart Foundry and enable **LA Hit Dice Lock** in the target world.
3. Create a class item named `LA` and add it to the character. Do not add class advancements for this special class.

The module recognizes `LA`, `L.A.`, `Level Adjustment`, `等级调整`, or its flags. Recognition writes persistent flags so the class can still be recognized after renaming.

## 公开 API

```js
game.laHdLock.normalizeActor(actor);
game.laHdLock.normalizeAllActors();
game.laHdLock.markSelectedTokensAsLA();
```

## 兼容性与测试范围

Target: Foundry V13.351 and D&D5e 5.3.3. Selected character, rest, and advancement cases were tested during development; test with a disposable actor before use in a production world. The public release is not a guarantee for all sheet or automation-module combinations.

## AI 参与与许可

Code and docs were AI-assisted and maintainer-directed. MIT license; see `LICENSE`.
