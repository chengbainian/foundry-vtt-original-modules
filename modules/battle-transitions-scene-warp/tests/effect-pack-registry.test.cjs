const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const hooks = new Map();
const settings = new Map();
const menus = new Map();
const transitions = new Map();
const moduleRecord = { id: "battle-transitions", version: "test", api: { legacyMarker: true } };

class ApplicationV2 {
  render() { return this; }
}

const context = vm.createContext({
  console,
  URL,
  Blob,
  Date,
  Map,
  Object,
  Array,
  String,
  Number,
  Promise,
  Error,
  globalThis: null,
  Hooks: {
    once(name, fn) { hooks.set(name, fn); },
    callAll() {}
  },
  game: {
    i18n: { lang: "zh-CN" },
    user: { isGM: true },
    modules: new Map([["battle-transitions", moduleRecord]]),
    settings: {
      register(namespace, key, data) {
        settings.set(`${namespace}.${key}`, structuredClone(data.default));
      },
      registerMenu(namespace, key, data) { menus.set(`${namespace}.${key}`, data); },
      get(namespace, key) { return settings.get(`${namespace}.${key}`); },
      async set(namespace, key, value) { settings.set(`${namespace}.${key}`, structuredClone(value)); }
    }
  },
  foundry: {
    utils: {
      deepClone: structuredClone,
      randomID: () => "random-source-id",
      getRoute: value => value
    },
    applications: {
      api: {
        ApplicationV2,
        HandlebarsApplicationMixin: Base => class extends Base {}
      },
      apps: {}
    }
  },
  ui: { notifications: { info() {}, warn() {}, error() {} } },
  navigator: {},
  canvas: null
});
context.globalThis = context;
context.SceneWarpTransitions = {
  registerTransition(id, definition, options) { transitions.set(id, { definition, options }); },
  unregisterByPack(packId) {
    let count = 0;
    for (const [id, entry] of transitions) {
      if (entry.options.packId === packId) { transitions.delete(id); count++; }
    }
    return count;
  }
};

(async () => {
  const sourcePath = path.resolve(__dirname, "../scripts/cinematic-presets.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const module = new vm.SourceTextModule(source, { context, identifier: sourcePath });
  await module.link(() => { throw new Error("Unexpected static import"); });
  await module.evaluate();
  hooks.get("init")();

  assert.ok(menus.has("battle-transitions.effectPackManager"), "settings menu is registered");
  assert.equal(moduleRecord.api.legacyMarker, true, "existing module API fields are preserved");
  assert.equal(moduleRecord.api.effectPacks.apiVersion, 1, "public API is exposed");

  const api = moduleRecord.api.effectPacks;
  api.registerEffectPack({
    id: "module-a.pack",
    label: "Module A",
    version: "1.0.0",
    presets: [{ id: "module-a.fade", sequence: [{ type: "wait", duration: 10 }] }],
    transitions: [{ id: "module-a.shader", createClientEffect() {} }]
  }, { owner: "module-a", sourceType: "module" });

  assert.equal(api.listEffectPacks().length, 1);
  assert.equal(api.listBattlePresets()[0].id, "module-a.fade");
  assert.ok(transitions.has("module-a.shader"), "executable transition is delegated to Scene Warp");

  api.registerEffectPack({
    id: "module-a.pack",
    label: "Module A Updated",
    version: "1.1.0",
    presets: [{ id: "module-a.fade", sequence: [] }]
  }, { owner: "module-a", sourceType: "module", replace: true });
  assert.equal(api.listEffectPacks()[0].version, "1.1.0", "same owner can update its pack");

  assert.throws(() => api.registerEffectPack({
    id: "module-a.pack",
    presets: []
  }, { owner: "module-b", replace: true }), /不能覆盖/, "another owner cannot hijack a pack ID");

  assert.throws(() => api.registerEffectPack({
    id: "module-b.pack",
    presets: [{ id: "module-a.fade", sequence: [] }]
  }, { owner: "module-b", replace: true }), /不能覆盖/, "another owner cannot hijack a preset ID");

  assert.throws(() => api.registerEffectPack({
    id: "remote.bad",
    transitions: [{ id: "remote.code", createClientEffect() {} }]
  }, { owner: "remote-source", declarative: true }), /只允许声明式预设/, "declarative packs cannot execute code");

  console.log("effect-pack registry tests: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
