/*
 * 中文说明：本模块把 LA 职业等级计入角色总等级／熟练加值，同时将其生命骰永久锁定。
 * 这样不会把 LA 错当成普通职业成长；具体识别、重休恢复与升级后的重新锁定逻辑见下方函数。
 *
 * LA Hit Dice Lock
 * Foundry VTT v13 + dnd5e 5.3.3
 *
 * Purpose:
 * - A class named "LA" / "Level Adjustment" / "等级调整" counts as class levels.
 * - Therefore total character level and proficiency bonus can still follow ECL-style logic.
 * - The LA class grants no usable Hit Dice: system.hd.spent is forced to equal system.levels.
 * - The LA class grants no spellcasting progression and no advancement entries.
 *
 * Why this approach:
 * dnd5e 5.3.3 ClassData requires system.hd.denomination to be a dice denomination such as "d6".
 * It does not support a truly hit-die-less class field. So we keep a legal d6 and lock all LA HD as spent.
 */

(function () {
  "use strict";

  const MODULE_ID = "la-hd-lock";
  const MODULE_TITLE = "LA Hit Dice Lock";

  // Main intended name: LA.
  // Extra names are included so the module remains robust if you rename the class later.
  const LA_NAME_RE = /^(?:LA|L\.A\.|Level\s*Adjustment|等级调整)$/i;

  function log(...args) {
    console.log(`${MODULE_TITLE} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_TITLE} |`, ...args);
  }

  function isLAClass(item) {
    if (!item || item.type !== "class") return false;

    const name = String(item.name ?? "").trim();
    const hasModuleFlag = item.getFlag(MODULE_ID, "isLA") === true;
    const hasWorldFlag = item.getFlag("world", "isLevelAdjustment") === true;
    const hasLAName = LA_NAME_RE.test(name);

    return hasModuleFlag || hasWorldFlag || hasLAName;
  }

  function getOwningActor(item) {
    const actor = item?.actor ?? item?.parent;
    return actor?.type === "character" ? actor : null;
  }

  function getLevels(item) {
    const levels = Number(item?.system?.levels ?? 0);
    if (!Number.isFinite(levels)) return 0;
    return Math.max(0, Math.floor(levels));
  }

  function getCleanAdvancement(item) {
    const advancement = foundry.utils.deepClone(item?.system?.advancement ?? []);
    if (!Array.isArray(advancement)) return [];

    // LA should not grant HP, ASI, subclass, traits, class features, choices, scale values, or anything else.
    // Keeping this empty is safer than trying to guess which advancement types are harmless.
    return [];
  }

  function setIfChanged(updates, document, path, desired) {
    const current = foundry.utils.getProperty(document, path);
    if (current !== desired) updates[path] = desired;
  }

  function sameJSON(a, b) {
    try {
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    } catch (_err) {
      return false;
    }
  }

  async function normalizeLAClass(item, { reason = "manual" } = {}) {
    if (!isLAClass(item)) return false;

    const actor = getOwningActor(item);
    if (!actor) return false;

    const levels = getLevels(item);
    const updates = {};

    // dnd5e 5.x requires a legal dice denomination. d6 is the least intrusive placeholder.
    setIfChanged(updates, item, "system.hd.denomination", "d6");

    // Core lock: all LA Hit Dice are treated as already spent. This preserves
    // ECL-style total level/PB while leaving zero usable HD from LA.
    setIfChanged(updates, item, "system.hd.spent", levels);

    // LA gives no spellcasting progression.
    setIfChanged(updates, item, "system.spellcasting.progression", "none");
    setIfChanged(updates, item, "system.spellcasting.ability", "");

    // LA gives no advancement entries.
    // 5.3 stores advancements as an ID-keyed object. Updating it with [] or {}
    // merges without removing existing entries; use Foundry deletion keys.
    const sourceAdvancement = item.toObject?.().system?.advancement ?? item.system?.advancement;
    if (sourceAdvancement && !Array.isArray(sourceAdvancement)) {
      for (const id of Object.keys(sourceAdvancement)) {
        updates[`system.advancement.-=${id}`] = null;
      }
    } else {
      const cleanAdvancement = getCleanAdvancement(item);
      if (!sameJSON(item.system?.advancement ?? [], cleanAdvancement)) {
        updates["system.advancement"] = cleanAdvancement;
      }
    }

    // Robust identification:
    // 1. Name matching, primarily "LA".
    // 2. Module flag.
    // 3. World flag, useful if you later mark an item through another macro/module.
    if (item.getFlag(MODULE_ID, "isLA") !== true) {
      updates[`flags.${MODULE_ID}.isLA`] = true;
    }
    if (item.getFlag("world", "isLevelAdjustment") !== true) {
      updates["flags.world.isLevelAdjustment"] = true;
    }

    if (!Object.keys(updates).length) return false;

    await item.update(updates, { [MODULE_ID]: true, reason });
    log(`Normalized LA class "${item.name}" on actor "${actor.name}". Reason: ${reason}. LA levels: ${levels}.`);
    return true;
  }

  async function normalizeActor(actor, { reason = "manual" } = {}) {
    if (!actor || actor.type !== "character") return 0;

    const laClasses = actor.items.filter(isLAClass);
    let count = 0;

    for (const item of laClasses) {
      const changed = await normalizeLAClass(item, { reason });
      if (changed) count += 1;
    }

    return count;
  }

  async function normalizeAllActors({ reason = "manual" } = {}) {
    let count = 0;
    for (const actor of game.actors.contents) {
      count += await normalizeActor(actor, { reason });
    }
    return count;
  }

  async function markSelectedTokensAsLA() {
    if (!canvas?.tokens?.controlled?.length) {
      ui.notifications.warn("请先选中至少一个角色 Token。");
      return;
    }

    let count = 0;
    for (const token of canvas.tokens.controlled) {
      const actor = token.actor;
      if (!actor || actor.type !== "character") continue;

      const laClasses = actor.items.filter(item => item.type === "class" && LA_NAME_RE.test(String(item.name ?? "").trim()));
      for (const item of laClasses) {
        await item.setFlag(MODULE_ID, "isLA", true);
        await item.setFlag("world", "isLevelAdjustment", true);
        await normalizeLAClass(item, { reason: "markSelectedTokensAsLA" });
        count += 1;
      }
    }

    ui.notifications.info(`已标记并锁定 ${count} 个 LA 职业。`);
  }

  Hooks.once("ready", async () => {
    if (game.system?.id !== "dnd5e") return;

    if (!game.system?.version?.startsWith("5.")) {
      warn(`This V13 port targets dnd5e 5.x. Current dnd5e version is ${game.system?.version}.`);
    }

    // Expose a tiny API for emergency/manual use from the console or macros.
    game.laHdLock = {
      isLAClass,
      normalizeLAClass,
      normalizeActor,
      normalizeAllActors,
      markSelectedTokensAsLA
    };

    if (!game.user.isGM) return;

    const count = await normalizeAllActors({ reason: "ready" });
    log(`Ready. Normalized ${count} LA class item(s).`);
  });

  Hooks.on("createItem", async (item, options, userId) => {
    if (!game.user.isGM) return;
    if (options?.[MODULE_ID]) return;
    if (!isLAClass(item)) return;

    await normalizeLAClass(item, { reason: "createItem" });
  });

  Hooks.on("updateItem", async (item, changes, options, userId) => {
    if (!game.user.isGM) return;
    if (options?.[MODULE_ID]) return;
    if (!isLAClass(item)) return;

    await normalizeLAClass(item, { reason: "updateItem" });
  });

  // After a short or long rest, dnd5e may recover hit dice. Re-lock LA HD immediately afterwards.
  Hooks.on("dnd5e.restCompleted", async (actor, result) => {
    if (!game.user.isGM) return;

    const count = await normalizeActor(actor, { reason: "restCompleted" });
    if (count) log(`Rest completed for "${actor.name}". Re-locked ${count} LA class item(s).`);
  });

  // After the level-up advancement manager finishes, lock again.
  Hooks.on("dnd5e.advancementManagerComplete", async (advancementManager) => {
    if (!game.user.isGM) return;

    const actor = advancementManager?.actor;
    const count = await normalizeActor(actor, { reason: "advancementManagerComplete" });
    if (count) log(`Advancement completed for "${actor?.name}". Re-locked ${count} LA class item(s).`);
  });
})();
