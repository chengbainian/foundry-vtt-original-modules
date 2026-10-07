/**
 * 中文说明：为合并版注册燃烧等电影转场预设，并接入效果包管理器。
 * 这里描述预设和调用流程；WebM 视频仍由维护者的 COS 地址提供，不打包到仓库。
 *
 * Effect-pack registry and manager for the merged Battle Transitions module.
 * JSON sources are declarative. Executable effects must be registered by an
 * installed module through the public API.
 */

const MODULE_ID = "battle-transitions";
const API_VERSION = 1;
const SETTINGS = { sources: "effectPackSources", imports: "importedEffectPacks" };
const BUILTIN_PACK_ID = "battle-transitions.builtin";
const BUILTIN_MANIFEST = `modules/${MODULE_ID}/effects/cinematic-effects.json`;
const MEDIA_DIRECTORY = "cinematic-transitions";
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const battlePresets = new Map();
const effectPacks = new Map();
let resolveReady;
const ready = new Promise(resolve => { resolveReady = resolve; });

const cinematicApi = Object.freeze({
  apiVersion: API_VERSION,
  ready,
  openManager,
  openTransitionDialog: () => globalThis.SceneWarpTransitions?.openDialog?.(),
  openMediaUploader,
  registerEffectPack,
  unregisterEffectPack,
  registerBattlePreset,
  unregisterBattlePreset,
  listEffectPacks,
  listBattlePresets,
  getBattlePreset,
  runBattlePreset,
  refreshEffectPacks: refreshConfiguredPacks
});

Hooks.once("init", () => {
  registerSettings();
  exposeApi();
});

Hooks.once("ready", async () => {
  exposeApi();
  let failures = 0;
  for (const [label, loader] of [
    ["bundled", loadBundledEffects],
    ["imported", loadImportedPacks],
    ["remote", () => refreshConfiguredPacks({ notify: false })]
  ]) {
    try { await loader(); } catch (error) {
      failures++;
      console.error(`${MODULE_ID} | ${label} effect-pack initialization failed`, error);
    }
  }
  try {
    if (failures) {
    ui.notifications?.warn?.("部分过场效果包未能载入；原有 BattleTransition 宏不受影响。");
    }
  } finally {
    realizeRegisteredTransitions();
    resolveReady(cinematicApi);
    Hooks.callAll(`${MODULE_ID}.effectPacksReady`, cinematicApi);
  }
});

function registerSettings() {
  for (const key of Object.values(SETTINGS)) {
    game.settings.register(MODULE_ID, key, { scope: "world", config: false, type: Object, default: {} });
  }
  game.settings.registerMenu(MODULE_ID, "effectPackManager", {
    name: "过场效果包管理",
    hint: "安装、更新和管理 Battle Transitions 与场景转场使用的效果包。",
    label: "管理效果包",
    icon: "fa-solid fa-clapperboard",
    type: CinematicEffectPackManager,
    restricted: true
  });
}

function exposeApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api = {
    ...(module.api ?? {}),
    cinematic: cinematicApi,
    effectPacks: cinematicApi,
    registerEffectPack,
    unregisterEffectPack
  };
  globalThis.CinematicTransitions = cinematicApi;
}

function normalizeId(value, label = "ID") {
  const id = String(value ?? "").trim();
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error(`${label} 只能包含英文字母、数字、点、下划线和短横线。`);
  }
  return id;
}

function normalizeBattlePreset(preset) {
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) throw new Error("BattleTransition 预设必须是对象。");
  const id = normalizeId(preset.id, "预设 ID");
  if (!Array.isArray(preset.sequence)) throw new Error(`预设 ${id} 缺少 sequence 数组。`);
  return {
    id,
    label: String(preset.label ?? id),
    description: String(preset.description ?? ""),
    sequence: foundry.utils.deepClone(preset.sequence)
  };
}

function normalizePack(pack, { declarative = false } = {}) {
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) throw new Error("效果包必须是一个 JSON 对象。");
  const id = normalizeId(pack.id, "效果包 ID");
  const presets = pack.battlePresets ?? pack.presets ?? [];
  const transitions = pack.transitions ?? [];
  if (!Array.isArray(presets)) throw new Error(`效果包 ${id} 的 presets 必须是数组。`);
  if (!Array.isArray(transitions)) throw new Error(`效果包 ${id} 的 transitions 必须是数组。`);
  if (declarative && transitions.length) throw new Error(`效果包 ${id} 含有可执行转场；JSON 来源只允许声明式预设。`);
  return {
    id,
    label: String(pack.label ?? pack.title ?? id),
    description: String(pack.description ?? ""),
    version: String(pack.version ?? "0.0.0"),
    homepage: String(pack.homepage ?? pack.url ?? ""),
    schemaVersion: Number(pack.schemaVersion ?? 1),
    battlePresets: presets.map(normalizeBattlePreset),
    transitions: [...transitions]
  };
}

function registerEffectPack(pack, options = {}) {
  const normalized = normalizePack(pack, { declarative: options.declarative === true });
  const owner = normalizeId(options.owner ?? MODULE_ID, "注册者 ID");
  const existing = effectPacks.get(normalized.id);
  if (existing && options.replace !== true) throw new Error(`效果包 ID 已存在：${normalized.id}`);
  if (existing && existing.owner !== owner) {
    throw new Error(`效果包 ${normalized.id} 已由 ${existing.owner} 注册，${owner} 不能覆盖。`);
  }
  for (const preset of normalized.battlePresets) {
    const registered = battlePresets.get(preset.id);
    if (registered && registered.owner !== owner) {
      throw new Error(`预设 ${preset.id} 已由 ${registered.owner} 注册，${owner} 不能覆盖。`);
    }
  }
  if (existing) unregisterEffectPack(normalized.id, { force: true });

  const record = {
    ...normalized,
    owner,
    sourceType: String(options.sourceType ?? "module"),
    sourceId: String(options.sourceId ?? ""),
    sourceUrl: String(options.sourceUrl ?? ""),
    registeredAt: Date.now()
  };
  effectPacks.set(record.id, record);
  for (const preset of record.battlePresets) {
    registerBattlePreset(preset, { packId: record.id, owner, replace: options.replace === true });
  }
  realizePackTransitions(record, { replace: options.replace === true });
  Hooks.callAll(`${MODULE_ID}.effectPackRegistered`, publicPackRecord(record));
  return publicPackRecord(record);
}

function unregisterEffectPack(packId, { owner = "", force = false } = {}) {
  const id = String(packId ?? "");
  const record = effectPacks.get(id);
  if (!record) return false;
  if (!force && owner && String(owner) !== record.owner) throw new Error(`只有注册者 ${record.owner} 可以移除效果包 ${id}。`);
  for (const [presetId, preset] of battlePresets) if (preset.packId === id) battlePresets.delete(presetId);
  globalThis.SceneWarpTransitions?.unregisterByPack?.(id, { owner: record.owner, force: true });
  effectPacks.delete(id);
  Hooks.callAll(`${MODULE_ID}.effectPackUnregistered`, id);
  return true;
}

function registerBattlePreset(preset, { packId = "standalone", owner = MODULE_ID, replace = false } = {}) {
  const normalized = normalizeBattlePreset(preset);
  if (battlePresets.has(normalized.id) && !replace) throw new Error(`过场预设 ID 已存在：${normalized.id}`);
  battlePresets.set(normalized.id, { ...normalized, packId: String(packId), owner: String(owner) });
  return getBattlePreset(normalized.id);
}

function unregisterBattlePreset(id, { owner = "", force = false } = {}) {
  const preset = battlePresets.get(String(id));
  if (!preset) return false;
  if (!force && owner && String(owner) !== preset.owner) throw new Error(`只有注册者 ${preset.owner} 可以移除预设 ${id}。`);
  return battlePresets.delete(String(id));
}

function realizePackTransitions(record, { replace = false } = {}) {
  const sceneWarp = globalThis.SceneWarpTransitions;
  if (!sceneWarp?.registerTransition) return;
  for (const definition of record.transitions) {
    if (!definition || typeof definition !== "object") continue;
    sceneWarp.registerTransition(normalizeId(definition.id, "场景转场 ID"), definition, {
      owner: record.owner,
      packId: record.id,
      replace
    });
  }
}

function realizeRegisteredTransitions() {
  for (const record of effectPacks.values()) realizePackTransitions(record, { replace: true });
}

function publicPackRecord(record) {
  const sourceLabels = {
    builtin: "模组内置",
    remote: "网址订阅",
    imported: "本地导入",
    module: `模组 API（${record.owner}）`
  };
  return {
    id: record.id,
    label: record.label,
    description: record.description,
    version: record.version,
    homepage: record.homepage,
    owner: record.owner,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    sourceUrl: record.sourceUrl,
    sourceLabel: sourceLabels[record.sourceType] ?? record.sourceType,
    isImported: record.sourceType === "imported",
    battlePresetCount: record.battlePresets.length,
    transitionCount: record.transitions.length
  };
}

function listEffectPacks() {
  return Array.from(effectPacks.values(), publicPackRecord).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

function listBattlePresets() {
  return Array.from(battlePresets.values(), preset => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    packId: preset.packId,
    owner: preset.owner
  })).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

function getBattlePreset(id) {
  const preset = battlePresets.get(String(id));
  return preset ? foundry.utils.deepClone(preset) : undefined;
}

async function runBattlePreset(id, targetSceneId) {
  await ready;
  if (!game.user.isGM) throw new Error("只有 GM 可以发起场景转场。");
  const preset = battlePresets.get(String(id));
  if (!preset) throw new Error(`找不到过场预设：${id}`);
  if (typeof globalThis.BattleTransition !== "function") throw new Error("Battle Transitions 核心 API 未加载。");
  const scene = targetSceneId ? game.scenes.get(targetSceneId) : (canvas?.scene ?? game.scenes.active);
  if (!scene) throw new Error("找不到目标场景；请传入场景 ID。");
  return new globalThis.BattleTransition(scene).addSequence(foundry.utils.deepClone(preset.sequence)).execute();
}

async function loadBundledEffects() {
  const response = await fetch(foundry.utils.getRoute(BUILTIN_MANIFEST), { cache: "no-store" });
  if (!response.ok) throw new Error(`无法读取内置效果清单 (${response.status})`);
  const manifest = await response.json();
  const presets = [];
  for (const entry of Array.isArray(manifest.entries) ? manifest.entries : []) {
    const path = String(entry?.path ?? entry?.entry ?? "");
    if (!path || path.includes("..") || !path.startsWith("effects/")) continue;
    if (entry.type === "battle-preset") {
      const presetResponse = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/${path}`), { cache: "no-store" });
      if (!presetResponse.ok) throw new Error(`无法读取内置预设 ${path} (${presetResponse.status})`);
      presets.push(await presetResponse.json());
    } else if (entry.type === "scene-extension") {
      const imported = await import(foundry.utils.getRoute(`modules/${MODULE_ID}/${path}`));
      if (typeof imported.register !== "function") throw new Error(`内置场景扩展没有导出 register(api)：${path}`);
      await imported.register({ cinematic: cinematicApi, sceneWarp: globalThis.SceneWarpTransitions });
    }
  }
  const builtInTransitions = ["vortex-redshift", "fade", "soft-white-fade"]
    .map(id => ({ id, ...globalThis.SceneWarpTransitions?.getTransition?.(id) }))
    .filter(definition => typeof definition.createClientEffect === "function");
  registerEffectPack({
    id: BUILTIN_PACK_ID,
    label: "内置电影转场",
    description: "随模组安装的燃烧、红移/蓝移与基础淡入淡出效果。",
    version: game.modules.get(MODULE_ID)?.version ?? "0.0.0",
    battlePresets: presets,
    transitions: builtInTransitions
  }, { owner: MODULE_ID, sourceType: "builtin", replace: true });
}

function getObjectSetting(key) {
  const value = game.settings.get(MODULE_ID, key);
  return value && typeof value === "object" && !Array.isArray(value) ? foundry.utils.deepClone(value) : {};
}

async function loadImportedPacks() {
  for (const [storageId, pack] of Object.entries(getObjectSetting(SETTINGS.imports))) {
    try {
      registerEffectPack(pack, {
        owner: `${MODULE_ID}.import.${storageId}`,
        sourceType: "imported",
        sourceId: storageId,
        declarative: true,
        replace: true
      });
    } catch (error) {
      console.error(`${MODULE_ID} | Imported effect pack ${storageId} failed`, error);
    }
  }
}

async function fetchDeclarativePack(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { throw new Error("效果包网址无效。"); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("效果包网址必须使用 HTTP 或 HTTPS。");
  const response = await fetch(parsed.href, { cache: "no-store" });
  if (!response.ok) throw new Error(`下载失败 (${response.status})`);
  const text = await response.text();
  if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new Error("效果包 JSON 超过 5 MB 限制。");
  return normalizePack(JSON.parse(text), { declarative: true });
}

async function refreshConfiguredPacks({ notify = true } = {}) {
  const sources = getObjectSetting(SETTINGS.sources);
  let loaded = 0;
  let failed = 0;
  for (const source of Object.values(sources)) {
    if (!source.enabled) continue;
    try {
      const pack = await fetchDeclarativePack(source.url);
      if (source.packId && source.packId !== pack.id) unregisterEffectPack(source.packId, { force: true });
      registerEffectPack(pack, {
        owner: `${MODULE_ID}.source.${source.id}`,
        sourceType: "remote",
        sourceId: source.id,
        sourceUrl: source.url,
        declarative: true,
        replace: true
      });
      Object.assign(source, { packId: pack.id, version: pack.version, lastCheckedAt: Date.now(), error: "" });
      loaded++;
    } catch (error) {
      Object.assign(source, { lastCheckedAt: Date.now(), error: error.message });
      failed++;
      console.error(`${MODULE_ID} | Effect source refresh failed`, source.url, error);
    }
  }
  if (game.user.isGM) await game.settings.set(MODULE_ID, SETTINGS.sources, sources);
  if (notify) (failed ? ui.notifications.warn : ui.notifications.info)(`效果包刷新完成：成功 ${loaded}，失败 ${failed}。`);
  return { loaded, failed };
}

function openManager() {
  if (!game.user.isGM) throw new Error("只有 GM 可以管理效果包。");
  return new CinematicEffectPackManager().render(true);
}

async function openMediaUploader() {
  if (!game.user.isGM) throw new Error("只有 GM 可以上传过场媒体。");
  const FilePickerClass = foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  if (!FilePickerClass) throw new Error("Foundry 文件管理器不可用。");
  try { await FilePickerClass.createDirectory?.("data", MEDIA_DIRECTORY); } catch (error) {
    if (!/exist/i.test(String(error?.message ?? ""))) console.debug(`${MODULE_ID} | Media directory`, error);
  }
  return new FilePickerClass({
    type: "any",
    current: MEDIA_DIRECTORY,
    callback: async path => {
      try { await navigator.clipboard?.writeText?.(path); } catch {}
      ui.notifications.info(`媒体路径已选择并复制：${path}`);
    }
  }).render(true);
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class CinematicEffectPackManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "battle-transitions-effect-pack-manager",
    classes: ["battle-transitions", "cinematic-effect-pack-manager"],
    position: { width: 780, height: 720 },
    window: { title: "过场效果包管理", icon: "fa-solid fa-clapperboard", resizable: true }
  };
  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/effect-pack-manager.hbs` } };

  async _prepareContext() {
    const sources = Object.values(getObjectSetting(SETTINGS.sources)).map(source => ({
      ...source,
      lastChecked: source.lastCheckedAt ? new Date(source.lastCheckedAt).toLocaleString() : "从未",
      status: source.error ? `错误：${source.error}` : (source.version ? `已载入 ${source.version}` : "尚未载入")
    }));
    return {
      packs: listEffectPacks(),
      sources,
      hasPacks: effectPacks.size > 0,
      hasSources: sources.length > 0,
      apiVersion: API_VERSION,
      moduleVersion: game.modules.get(MODULE_ID)?.version ?? "",
      mediaDirectory: MEDIA_DIRECTORY
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    root.querySelector("[data-action='add-source']")?.addEventListener("click", () => this.#addSource());
    root.querySelector("[data-action='refresh-all']")?.addEventListener("click", () => this.#refreshAll());
    root.querySelector("[data-action='import-json']")?.addEventListener("click", () => root.querySelector("input[data-role='json-file']")?.click());
    root.querySelector("input[data-role='json-file']")?.addEventListener("change", event => this.#importJson(event));
    root.querySelector("[data-action='upload-media']")?.addEventListener("click", () => openMediaUploader());
    root.querySelector("[data-action='open-transition']")?.addEventListener("click", () => cinematicApi.openTransitionDialog());
    root.querySelectorAll("[data-action='toggle-source']").forEach(input => input.addEventListener("change", event => this.#toggleSource(event)));
    root.querySelectorAll("[data-action='refresh-source']").forEach(button => button.addEventListener("click", event => this.#refreshSource(event)));
    root.querySelectorAll("[data-action='remove-source']").forEach(button => button.addEventListener("click", event => this.#removeSource(event)));
    root.querySelectorAll("[data-action='remove-import']").forEach(button => button.addEventListener("click", event => this.#removeImport(event)));
  }

  async #addSource() {
    const url = this.element.querySelector("input[name='source-url']")?.value?.trim();
    const label = this.element.querySelector("input[name='source-label']")?.value?.trim();
    if (!url) return ui.notifications.warn("请填写效果包 JSON 网址。");
    try {
      const pack = await fetchDeclarativePack(url);
      const sources = getObjectSetting(SETTINGS.sources);
      const id = foundry.utils.randomID();
      sources[id] = { id, label: label || pack.label, url, enabled: true, packId: pack.id, version: pack.version, lastCheckedAt: Date.now(), error: "" };
      await game.settings.set(MODULE_ID, SETTINGS.sources, sources);
      registerEffectPack(pack, { owner: `${MODULE_ID}.source.${id}`, sourceType: "remote", sourceId: id, sourceUrl: url, declarative: true, replace: true });
      ui.notifications.info(`已添加效果包：${pack.label} ${pack.version}`);
      this.render(false);
    } catch (error) { ui.notifications.error(`添加失败：${error.message}`); }
  }

  async #toggleSource(event) {
    const id = event.currentTarget.dataset.sourceId;
    const sources = getObjectSetting(SETTINGS.sources);
    if (!sources[id]) return;
    sources[id].enabled = event.currentTarget.checked;
    await game.settings.set(MODULE_ID, SETTINGS.sources, sources);
    if (!sources[id].enabled && sources[id].packId) unregisterEffectPack(sources[id].packId, { force: true });
    else if (sources[id].enabled) await this.#refreshSourceById(id);
    this.render(false);
  }

  async #refreshSource(event) {
    await this.#refreshSourceById(event.currentTarget.dataset.sourceId);
    this.render(false);
  }

  async #refreshSourceById(id) {
    const sources = getObjectSetting(SETTINGS.sources);
    const source = sources[id];
    if (!source) return;
    try {
      const pack = await fetchDeclarativePack(source.url);
      if (source.packId && source.packId !== pack.id) unregisterEffectPack(source.packId, { force: true });
      registerEffectPack(pack, { owner: `${MODULE_ID}.source.${id}`, sourceType: "remote", sourceId: id, sourceUrl: source.url, declarative: true, replace: true });
      Object.assign(source, { packId: pack.id, version: pack.version, lastCheckedAt: Date.now(), error: "" });
      ui.notifications.info(`已更新：${pack.label} ${pack.version}`);
    } catch (error) {
      Object.assign(source, { lastCheckedAt: Date.now(), error: error.message });
      ui.notifications.error(`更新失败：${error.message}`);
    }
    await game.settings.set(MODULE_ID, SETTINGS.sources, sources);
  }

  async #refreshAll() { await refreshConfiguredPacks(); this.render(false); }

  async #removeSource(event) {
    const id = event.currentTarget.dataset.sourceId;
    const sources = getObjectSetting(SETTINGS.sources);
    if (!sources[id]) return;
    if (sources[id].packId) unregisterEffectPack(sources[id].packId, { force: true });
    delete sources[id];
    await game.settings.set(MODULE_ID, SETTINGS.sources, sources);
    this.render(false);
  }

  async #importJson(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return ui.notifications.error("效果包 JSON 超过 5 MB 限制。");
    try {
      const pack = normalizePack(JSON.parse(await file.text()), { declarative: true });
      const imports = getObjectSetting(SETTINGS.imports);
      imports[pack.id] = pack;
      await game.settings.set(MODULE_ID, SETTINGS.imports, imports);
      registerEffectPack(pack, { owner: `${MODULE_ID}.import.${pack.id}`, sourceType: "imported", sourceId: pack.id, declarative: true, replace: true });
      ui.notifications.info(`已导入效果包：${pack.label} ${pack.version}`);
      this.render(false);
    } catch (error) { ui.notifications.error(`导入失败：${error.message}`); }
  }

  async #removeImport(event) {
    const id = event.currentTarget.dataset.packId;
    const imports = getObjectSetting(SETTINGS.imports);
    delete imports[id];
    await game.settings.set(MODULE_ID, SETTINGS.imports, imports);
    unregisterEffectPack(id, { force: true });
    this.render(false);
  }
}

export { cinematicApi, registerEffectPack, unregisterEffectPack, registerBattlePreset, unregisterBattlePreset };
