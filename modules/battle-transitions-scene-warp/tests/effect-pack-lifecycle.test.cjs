const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const hooks = new Map();
const settings = new Map();
const transitions = new Map([
  ["vortex-redshift", { label: "Vortex", description: "", owner: "battle-transitions", packId: "battle-transitions.builtin", createClientEffect() {} }],
  ["fade", { label: "Fade", description: "", owner: "battle-transitions", packId: "battle-transitions.builtin", createClientEffect() {} }]
]);
const moduleRecord = { id: "battle-transitions", version: "2.0.14-cinematic-v13.2", api: {} };

class ApplicationV2 { render() { return this; } }
const response = body => ({ ok: true, status: 200, async json() { return structuredClone(body); }, async text() { return JSON.stringify(body); } });

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
  fetch: async url => {
    const relative = String(url).match(/(?:^|\/)(effects\/(?:cinematic-effects\.json|presets\/flame-burn(?:-v[45])?\.json))$/)?.[1];
    if (relative) return response(JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8")));
    throw new Error(`Unexpected fetch: ${url}`);
  },
  Hooks: {
    once(name, fn) { hooks.set(name, fn); },
    callAll() {}
  },
  game: {
    i18n: { lang: "zh-CN" },
    user: { isGM: true },
    modules: new Map([["battle-transitions", moduleRecord]]),
    settings: {
      register(namespace, key, data) { settings.set(`${namespace}.${key}`, structuredClone(data.default)); },
      registerMenu() {},
      get(namespace, key) { return settings.get(`${namespace}.${key}`); },
      async set(namespace, key, value) { settings.set(`${namespace}.${key}`, structuredClone(value)); }
    }
  },
  foundry: {
    utils: { deepClone: structuredClone, randomID: () => "id", getRoute: value => value },
    applications: { api: { ApplicationV2, HandlebarsApplicationMixin: Base => class extends Base {} }, apps: {} }
  },
  ui: { notifications: { info() {}, warn() {}, error() {} } },
  navigator: {},
  canvas: null
});
context.globalThis = context;
context.SceneWarpTransitions = {
  registerTransition(id, definition, options) { transitions.set(id, { ...definition, ...options }); },
  unregisterByPack(packId) {
    for (const [id, entry] of transitions) if (entry.packId === packId) transitions.delete(id);
  },
  getTransition(id) { return transitions.get(id); }
};

(async () => {
  const sourcePath = path.resolve(__dirname, "../scripts/cinematic-presets.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const dynamicImport = async specifier => {
    assert.match(String(specifier), /soft-white-fade\.mjs$/);
    const extension = new vm.SyntheticModule(["register"], function init() {
      this.setExport("register", ({ sceneWarp }) => sceneWarp.registerTransition("soft-white-fade", {
        label: "Soft White",
        createClientEffect() {}
      }, { owner: "battle-transitions", packId: "battle-transitions.builtin", replace: true }));
    }, { context });
    await extension.link(() => {});
    await extension.evaluate();
    return extension;
  };
  const module = new vm.SourceTextModule(source, { context, identifier: sourcePath, importModuleDynamically: dynamicImport });
  await module.link(() => { throw new Error("Unexpected static import"); });
  await module.evaluate();
  hooks.get("init")();
  await hooks.get("ready")();
  await moduleRecord.api.effectPacks.ready;

  const packs = moduleRecord.api.effectPacks.listEffectPacks();
  assert.equal(packs.length, 1);
  assert.equal(packs[0].id, "battle-transitions.builtin");
  assert.equal(packs[0].battlePresetCount, 3);
  assert.equal(packs[0].transitionCount, 3);
  assert.deepEqual(new Set(transitions.keys()), new Set(["vortex-redshift", "fade", "soft-white-fade"]));
  const presets = moduleRecord.api.effectPacks.listBattlePresets();
  assert.deepEqual(new Set(presets.map(p => p.id)), new Set(["flame-burn", "flame-burn-v4", "flame-burn-v5"]));
  for (const name of ["flame-burn", "flame-burn-v4", "flame-burn-v5"]) {
    const preset=JSON.parse(fs.readFileSync(path.resolve(__dirname,"../effects/presets",`${name}.json`),"utf8"));
    const step=preset.sequence[0];
    assert.equal(step.type,"parallel");
    assert.equal(step.sequences[0][0].duration,2000);
    assert.equal(step.sequences[0][1].type,"removeoverlay");
    const video=step.sequences[1][0];
    assert.equal(video.type,"video");
    assert.equal(video.enableChromaKey,false);
    const version=name==="flame-burn"?"v6":name.slice(-2);
    const videoPath = `modules/battle-transitions/assets/videos/burn-transition-${version}.webm`;
    assert.equal(video.file, videoPath);
    assert(fs.existsSync(path.resolve(__dirname,"../assets/videos",`burn-transition-${version}.webm`)));
  }

  console.log("effect-pack lifecycle tests: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
