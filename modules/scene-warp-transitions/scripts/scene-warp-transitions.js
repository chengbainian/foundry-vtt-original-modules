/**
 * 中文说明：独立版场景转场的 API、设置窗口与客户端画布特效。
 * GM 发起场景切换后，通过 socket 同步各客户端的红移／蓝移漩涡，并在结束时清理遮罩。
 *
 * Scene Warp Transitions for Foundry VTT V12–V14.
 *
 * This module deliberately does not call the internal API of Sequencer or
 * Battle Transitions.  A stage-level PIXI filter lets every connected client
 * distort its own live canvas, including scenes whose background is a video.
 */

const MODULE_ID = "scene-warp-transitions";
const SOCKET_NAME = `module.${MODULE_ID}`;
const ACTIVE_TRANSITIONS = new Map();
const TRANSITIONS = new Map();

const DEFAULT_PRESET = "vortex-redshift";
const DEFAULT_DURATION_SECONDS = 4.5;
const MIN_DURATION_SECONDS = 1.5;
const MAX_DURATION_SECONDS = 20;

// This body intentionally has two distinct phases. During departure it keeps
// the old scene in the vortex while shrinking and redshifting it. During
// arrival it starts the new scene small, blue-tinted and counter-twisted.
const VORTEX_SHADER_BODY = `
void main(void) {
  vec2 uv = vTextureCoord;
  vec2 p = uv - 0.5;
  float aspect = screenSize.x / max(screenSize.y, 1.0);
  p.x *= aspect;

  float radius = length(p);
  float inner = pow(1.0 - smoothstep(0.04, 0.96, radius), 1.22);
  float departing = 1.0 - transitionMode;
  float arriving = transitionMode;
  float redshift = departing * smoothstep(0.42, 0.98, progress);
  float blueshift = arriving * progress;
  float vortex = departing * smoothstep(0.02, 0.46, progress) + arriving * progress;
  float turnDirection = mix(1.0, -1.0, transitionMode);

  float angle = atan(p.y, p.x);
  angle += turnDirection * vortex * inner * (2.3 + 5.7 * inner);
  float pull = 1.0 + vortex * inner * (0.16 + 0.47 * inner);
  vec2 warped = vec2(cos(angle), sin(angle)) * radius * pull;
  warped.x /= aspect;
  warped += 0.5;

  // The scene recedes into a small core while it leaves, and the target starts
  // from that same small core before expanding back to its normal scale.
  float compactScale = max(0.18, 1.0 - redshift * 0.79 - blueshift * 0.78);
  vec2 sampled = 0.5 + (warped - 0.5) / compactScale;

  vec4 base = SAMPLE(sampled);
  float stretch = redshift + blueshift * 0.62;
  vec2 ray = normalize(sampled - 0.5 + vec2(0.0001, 0.0));
  vec4 blurA = SAMPLE(sampled + ray * (0.014 + stretch * 0.027));
  vec4 blurB = SAMPLE(sampled + ray * (0.031 + stretch * 0.062));
  vec4 blurC = SAMPLE(sampled + ray * (0.058 + stretch * 0.115));
  vec4 stretched = base * 0.43 + blurA * 0.28 + blurB * 0.19 + blurC * 0.10;
  vec4 color = mix(base, stretched, stretch * 0.94);

  float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 redColor = color.rgb;
  redColor.r = max(redColor.r, luminance * (0.74 + redshift * 1.08) + redshift * 0.12);
  redColor.g *= 1.0 - redshift * 0.53;
  redColor.b *= 1.0 - redshift * 0.86;

  // Arrival has a restrained cool shift only; it is not another red overlay.
  float cool = blueshift * 0.46;
  vec3 blueColor = color.rgb;
  blueColor.b = max(blueColor.b, luminance * (0.78 + cool * 0.96) + cool * 0.05);
  blueColor.g *= 1.0 - cool * 0.16;
  blueColor.r *= 1.0 - cool * 0.68;

  color.rgb = mix(color.rgb, redColor, redshift);
  color.rgb = mix(color.rgb, blueColor, cool);
  float edgeFade = redshift * smoothstep(0.22, 1.02, radius) * 0.74
                 + blueshift * smoothstep(0.40, 1.02, radius) * 0.32;
  color.rgb *= 1.0 - edgeFade;
  color.a = 1.0;
  OUTPUT_COLOR = color;
}
`;

// PIXI 7 (Foundry V12) uses GLSL ES 1 syntax and the uSampler texture name.
const VORTEX_FRAGMENT_V7 = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float progress;
uniform float transitionMode;
uniform vec2 screenSize;
#define SAMPLE(uv) texture2D(uSampler, uv)
#define OUTPUT_COLOR gl_FragColor
${VORTEX_SHADER_BODY}
`;

// PIXI 8 (Foundry V13–V14) uses GLSL ES 3 syntax and the uTexture name.
const VORTEX_FRAGMENT_V8 = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float progress;
uniform float transitionMode;
uniform vec2 screenSize;
#define SAMPLE(uv) texture(uTexture, uv)
#define OUTPUT_COLOR finalColor
${VORTEX_SHADER_BODY}
`;

Hooks.once("init", () => {
  registerTransition("vortex-redshift", {
    label: "时空漩涡（红移）",
    description: "旧场景持续卷入漩涡并红移缩远；目标场景从同一涡核蓝移、反向解扭后显现。",
    createClientEffect: context => new VortexRedshiftEffect(context)
  });

  registerTransition("fade", {
    label: "黑场淡入淡出",
    description: "基础预设；可作为以后新增转场的参考。",
    createClientEffect: context => new FadeEffect(context)
  });
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, receiveSocketMessage);

  const api = {
    openDialog,
    transitionTo,
    registerTransition,
    listTransitions: () => Array.from(TRANSITIONS, ([id, transition]) => ({
      id,
      label: transition.label,
      description: transition.description ?? ""
    })),
    getTransition: id => TRANSITIONS.get(id)
  };

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  globalThis.SceneWarpTransitions = api;
});

Hooks.on("canvasReady", () => {
  for (const controller of ACTIVE_TRANSITIONS.values()) controller.onCanvasReady();
});

/**
 * Public extension point. A preset needs a label and a function that returns
 * an object exposing attach(), setProgress(), and destroy().
 */
function registerTransition(id, definition) {
  if (!id || typeof id !== "string") throw new Error("转场预设 ID 必须是非空字符串。");
  if (!definition || typeof definition.createClientEffect !== "function") {
    throw new Error(`转场预设 ${id} 缺少 createClientEffect(context)。`);
  }

  TRANSITIONS.set(id, {
    label: definition.label || id,
    description: definition.description || "",
    createClientEffect: definition.createClientEffect
  });
}

function openDialog() {
  if (!game.user.isGM) {
    ui.notifications.warn("只有 GM 可以发起场景转场。");
    return;
  }

  const sourceScene = canvas?.scene ?? game.scenes.active;
  if (!sourceScene) {
    ui.notifications.error("当前没有可供转场的场景。");
    return;
  }

  const targets = game.scenes.filter(scene => scene.id !== sourceScene.id);
  if (!targets.length) {
    ui.notifications.warn("至少需要创建第二个场景才能转场。");
    return;
  }

  const sceneOptions = targets
    .map(scene => `<option value="${escapeHtml(scene.id)}">${escapeHtml(scene.name || "未命名场景")}</option>`)
    .join("");

  const presetOptions = Array.from(TRANSITIONS, ([id, preset]) => {
    const selected = id === DEFAULT_PRESET ? " selected" : "";
    return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(preset.label)}</option>`;
  }).join("");

  const content = `
    <form class="swt-dialog-form">
      <p class="notes">对所有已连接客户端播放。目标场景将成为激活场景。</p>
      <div class="form-group">
        <label>目标场景</label>
        <div class="form-fields"><select name="targetSceneId">${sceneOptions}</select></div>
      </div>
      <div class="form-group">
        <label>转场预设</label>
        <div class="form-fields"><select name="presetId">${presetOptions}</select></div>
      </div>
      <div class="form-group">
        <label>总时长（秒）</label>
        <div class="form-fields"><input name="duration" type="number" min="${MIN_DURATION_SECONDS}" max="${MAX_DURATION_SECONDS}" step="0.1" value="${DEFAULT_DURATION_SECONDS}"></div>
      </div>
      <div class="form-group">
        <label>强制切到目标场景</label>
        <div class="form-fields"><input name="forceView" type="checkbox" checked></div>
      </div>
    </form>`;

  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (DialogV2) return openDialogV2(DialogV2, content);

  // Foundry V12's Application V1 dialog path.
  return openDialogV1(content);
}

function openDialogV1(content) {
  new Dialog({
    title: "场景时空转场",
    content,
    buttons: {
      start: {
        icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>',
        label: "开始转场",
        callback: html => {
          submitDialogForm(html[0] ?? html);
        }
      },
      cancel: { icon: '<i class="fa-solid fa-xmark"></i>', label: "取消" }
    },
    default: "start"
  }, { width: 470 }).render(true);
}

function openDialogV2(DialogV2, content) {
  new DialogV2({
    window: { title: "场景时空转场" },
    content,
    modal: true,
    buttons: [
      {
        action: "start",
        icon: "fa-solid fa-wand-magic-sparkles",
        label: "开始转场",
        default: true,
        callback: (_event, button) => submitDialogForm(button.form)
      },
      {
        action: "cancel",
        icon: "fa-solid fa-xmark",
        label: "取消"
      }
    ]
  }).render({ force: true });
}

function submitDialogForm(root) {
  const form = root?.tagName === "FORM" ? root : root?.querySelector?.("form");
  const targetSceneId = form?.querySelector('[name="targetSceneId"]')?.value;
  const presetId = form?.querySelector('[name="presetId"]')?.value;
  const duration = Number(form?.querySelector('[name="duration"]')?.value);
  const forceView = Boolean(form?.querySelector('[name="forceView"]')?.checked);
  transitionTo(targetSceneId, { presetId, duration, forceView }).catch(error => {
    console.error(`${MODULE_ID} | 无法发起场景转场`, error);
    ui.notifications.error(`无法发起场景转场：${error.message}`);
  });
}

async function transitionTo(targetSceneId, options = {}) {
  if (!game.user.isGM) throw new Error("只有 GM 可以发起场景转场。");

  const sourceScene = canvas?.scene ?? game.scenes.active;
  const targetScene = game.scenes.get(targetSceneId);
  if (!sourceScene) throw new Error("当前没有打开的场景。");
  if (!targetScene) throw new Error("找不到所选目标场景。");
  if (targetScene.id === sourceScene.id) throw new Error("目标场景不能与当前场景相同。");

  const presetId = TRANSITIONS.has(options.presetId) ? options.presetId : DEFAULT_PRESET;
  const durationSeconds = clampNumber(options.duration, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS, DEFAULT_DURATION_SECONDS);
  const totalMs = Math.round(durationSeconds * 1000);
  // Reserve most of the first half for the visible vortex wind-up and its
  // redshift departure. The destination gets its own unspooling interval.
  const outgoingMs = Math.round(totalMs * 0.58);
  const bridgeMs = Math.max(100, Math.round(totalMs * 0.04));
  const incomingMs = totalMs - outgoingMs - bridgeMs;

  const payload = {
    action: "begin",
    id: randomId(),
    initiatedBy: game.user.id,
    sourceSceneId: sourceScene.id,
    targetSceneId: targetScene.id,
    presetId,
    outgoingMs,
    bridgeMs,
    incomingMs,
    switchAt: Date.now() + outgoingMs,
    forceView: options.forceView !== false
  };

  receiveSocketMessage(payload);
  game.socket.emit(SOCKET_NAME, payload);
  return payload.id;
}

function receiveSocketMessage(payload) {
  if (!payload || payload.action !== "begin" || !payload.id) return;
  if (!game.users.get(payload.initiatedBy)?.isGM) return;
  if (ACTIVE_TRANSITIONS.has(payload.id)) return;

  const controller = new ClientTransition(payload);
  ACTIVE_TRANSITIONS.set(payload.id, controller);
  controller.start().catch(error => {
    console.error(`${MODULE_ID} | 转场失败`, error);
    controller.destroy();
    ACTIVE_TRANSITIONS.delete(payload.id);
    if (game.user.isGM) ui.notifications.error(`场景转场失败：${error.message}`);
  });
}

class ClientTransition {
  constructor(payload) {
    this.payload = payload;
    this.overlay = null;
    this.effect = null;
    this.outgoingFinished = false;
    this.targetCanvasReady = false;
    this.incomingStarted = false;
    this.destroyed = false;
    this.timers = new Set();
  }

  async start() {
    this.overlay = createOverlay(this.payload.id);

    const preset = TRANSITIONS.get(this.payload.presetId) ?? TRANSITIONS.get(DEFAULT_PRESET);
    this.effect = await preset.createClientEffect({ overlay: this.overlay, payload: this.payload });
    this.effect.attach(canvas?.stage);
    this.effect.setProgress(0, "out");

    this.play(0, 1, this.payload.outgoingMs, "out").then(() => {
      this.outgoingFinished = true;
      this.tryStartIncoming();
    });

    const switchDelay = Math.max(0, this.payload.switchAt - Date.now());
    this.schedule(() => this.switchScene(), switchDelay);

    // A scene with heavy video or many tiles may take a while to draw. Do not
    // leave anyone behind a black overlay indefinitely if canvasReady is late.
    this.schedule(() => this.fallbackTargetReady(), this.payload.outgoingMs + this.payload.bridgeMs + 6000);
  }

  async switchScene() {
    if (this.destroyed) return;
    const target = game.scenes.get(this.payload.targetSceneId);
    if (!target) return;

    try {
      if (game.user.isGM && game.user.id === this.payload.initiatedBy) await target.activate();
      if (this.payload.forceView && canvas?.scene?.id !== target.id) await target.view();
    } catch (error) {
      console.warn(`${MODULE_ID} | 无法显示目标场景`, error);
    }
  }

  onCanvasReady() {
    if (this.destroyed || canvas?.scene?.id !== this.payload.targetSceneId) return;
    this.targetCanvasReady = true;
    this.tryStartIncoming();
  }

  fallbackTargetReady() {
    if (this.destroyed || this.incomingStarted) return;
    if (canvas?.scene?.id === this.payload.targetSceneId) {
      this.targetCanvasReady = true;
      this.tryStartIncoming();
      return;
    }

    this.destroy();
    ACTIVE_TRANSITIONS.delete(this.payload.id);
    if (game.user.isGM) ui.notifications.warn("目标场景没有成功加载，已取消转场遮罩。");
  }

  tryStartIncoming() {
    if (this.destroyed || this.incomingStarted || !this.outgoingFinished || !this.targetCanvasReady) return;
    this.incomingStarted = true;

    const bridgeEndsAt = this.payload.switchAt + this.payload.bridgeMs;
    this.schedule(async () => {
      if (this.destroyed) return;
      this.effect.attach(canvas?.stage);
      this.effect.setProgress(1, "in");
      await this.play(1, 0, this.payload.incomingMs, "in");
      this.destroy();
      ACTIVE_TRANSITIONS.delete(this.payload.id);
    }, Math.max(0, bridgeEndsAt - Date.now()));
  }

  play(from, to, durationMs, phase) {
    return new Promise(resolve => {
      const started = performance.now();
      const tick = now => {
        if (this.destroyed) return resolve();
        const progress = Math.min(1, (now - started) / Math.max(1, durationMs));
        const eased = easeInOutCubic(progress);
        this.effect.setProgress(from + (to - from) * eased, phase);
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.effect?.destroy();
    this.overlay?.root.remove();
  }
}

class VortexRedshiftEffect {
  constructor({ overlay }) {
    this.overlay = overlay;
    this.filter = null;
    this.stage = null;
    this.previousFilters = null;
    this.previousFilterArea = null;
    this.progress = 0;
    this.phase = "out";

    if (!globalThis.PIXI?.Filter) throw new Error("未找到 PIXI.Filter；此模组需要 Foundry VTT V12–V14 的画布渲染器。");

    const screen = getScreenSize();
    this.filter = createVortexFilter(screen);
  }

  attach(stage) {
    if (!stage || this.stage === stage) return;
    this.detach();

    this.stage = stage;
    this.previousFilters = Array.isArray(stage.filters) ? [...stage.filters] : (stage.filters ? [stage.filters] : []);
    this.previousFilterArea = stage.filterArea;
    stage.filters = [...this.previousFilters, this.filter];

    const rendererScreen = canvas?.app?.renderer?.screen;
    if (rendererScreen) stage.filterArea = rendererScreen;
    this.setProgress(this.progress, this.phase);
  }

  setProgress(progress, phase = "out") {
    this.progress = Math.max(0, Math.min(1, Number(progress) || 0));
    this.phase = phase === "in" ? "in" : "out";
    const screen = getScreenSize();
    const uniforms = getFilterUniforms(this.filter);
    uniforms.progress = this.progress;
    uniforms.transitionMode = this.phase === "in" ? 1 : 0;
    uniforms.screenSize[0] = screen.width;
    uniforms.screenSize[1] = screen.height;

    // This veil only masks the one-frame Canvas swap. The actual warp, radial
    // stretch and colour shift all happen to the live canvas in the shader.
    const arriving = this.phase === "in";
    const blackout = arriving
      ? this.progress * 0.54
      : smoothstep(0.88, 1, this.progress) * 0.54;
    const veil = arriving
      ? this.progress * 0.34
      : smoothstep(0.84, 1, this.progress) * 0.24;
    this.overlay.root.style.setProperty("--swt-blackout", String(blackout));
    this.overlay.root.style.setProperty("--swt-veil", String(veil));
    this.overlay.root.classList.toggle("swt-arrival", arriving);
  }

  detach() {
    if (!this.stage) return;
    this.stage.filters = this.previousFilters?.length ? this.previousFilters : null;
    this.stage.filterArea = this.previousFilterArea;
    this.stage = null;
    this.previousFilters = null;
    this.previousFilterArea = null;
  }

  destroy() {
    this.detach();
    this.filter?.destroy?.();
  }
}

function createVortexFilter(screen) {
  const uniforms = {
    progress: 0,
    transitionMode: 0,
    screenSize: new Float32Array([screen.width, screen.height])
  };

  // Foundry V13 and V14 use PIXI 8. It changed custom filters to an options
  // object with typed resources, while V12's PIXI 7 keeps the classic form.
  if (isPixiV8()) {
    return PIXI.Filter.from({
      gl: { fragment: VORTEX_FRAGMENT_V8 },
      resources: {
        swtUniforms: {
          progress: { value: uniforms.progress, type: "f32" },
          transitionMode: { value: uniforms.transitionMode, type: "f32" },
          screenSize: { value: uniforms.screenSize, type: "vec2<f32>" }
        }
      }
    });
  }

  return new PIXI.Filter(undefined, VORTEX_FRAGMENT_V7, uniforms);
}

function getFilterUniforms(filter) {
  return filter.resources?.swtUniforms?.uniforms ?? filter.uniforms;
}

function isPixiV8() {
  const majorVersion = Number.parseInt(String(PIXI?.VERSION ?? "0").split(".")[0], 10);
  return majorVersion >= 8 || Boolean(PIXI?.GlProgram);
}

class FadeEffect {
  constructor({ overlay }) {
    this.overlay = overlay;
  }

  attach() {}

  setProgress(progress) {
    const value = Math.max(0, Math.min(1, Number(progress) || 0));
    this.overlay.root.style.setProperty("--swt-blackout", String(value));
    this.overlay.root.style.setProperty("--swt-veil", "0");
  }

  destroy() {}
}

function createOverlay(id) {
  document.getElementById(`swt-overlay-${id}`)?.remove();

  const root = document.createElement("div");
  root.id = `swt-overlay-${id}`;
  root.className = "swt-overlay";
  root.style.setProperty("--swt-blackout", "0");
  root.style.setProperty("--swt-veil", "0");

  const bridge = document.createElement("div");
  bridge.className = "swt-bridge";
  root.append(bridge);
  document.body.append(root);

  return { root, bridge };
}

function getScreenSize() {
  const screen = canvas?.app?.renderer?.screen;
  return {
    width: Math.max(1, screen?.width ?? window.innerWidth),
    height: Math.max(1, screen?.height ?? window.innerHeight)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function smoothstep(min, max, value) {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

function randomId() {
  return foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2);
}

function escapeHtml(value) {
  const text = String(value ?? "");
  if (foundry?.utils?.escapeHTML) return foundry.utils.escapeHTML(text);
  return text.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    "\"": "&quot;"
  })[character]);
}
