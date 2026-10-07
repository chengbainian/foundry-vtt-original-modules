// 中文说明：私密羊皮纸的客户端与 GM 界面入口。
// GM 通过 socket 向所选玩家发送内容；每个客户端只在本地渲染收到的纸页，不写入世界文档。
const MODULE_ID = "private-parchment";
const SOCKET_NAME = `module.${MODULE_ID}`;
const DEFAULT_BACKGROUND = `modules/${MODULE_ID}/assets/parchment.png`;
const CUSTOM_FONT_DIR = `modules/${MODULE_ID}/fonts/custom`;
const CUSTOM_FONT_MANIFEST = `${CUSTOM_FONT_DIR}/fonts.json`;
const OVERLAY_ID = "private-parchment-overlay";
const COMPOSER_ID = "private-parchment-composer";
const FONT_EXTENSIONS = new Set(["ttf", "otf", "woff", "woff2"]);
const CUSTOM_FONT_CACHE = new Map();

const BUILTIN_FONTS = {
  "builtin:brush": {
    label: "马善政毛笔（中文花体）",
    family: '"Ma Shan Zheng", "STKaiti", "KaiTi", cursive'
  },
  "builtin:kaiti": {
    label: "楷体",
    family: '"STKaiti", "KaiTi", "KaiTi_GB2312", serif'
  },
  "builtin:song": {
    label: "宋体",
    family: '"SimSun", "Songti SC", serif'
  },
  "builtin:fantasy": {
    label: "Cinzel Decorative（西文奇幻）",
    family: '"Cinzel Decorative", Georgia, serif'
  },
  "builtin:script": {
    label: "西文花体",
    family: '"Segoe Script", "Lucida Calligraphy", cursive'
  }
};

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, handleSocketMessage);

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      openComposer,
      showLocal: showParchment,
      hideLocal: hideParchment,
      listFonts: () => getAvailableFonts(),
      refreshFonts: () => getAvailableFonts({ refresh: true })
    };
  }

  console.log(`${MODULE_ID} | Ready`);
});

function handleSocketMessage(payload) {
  if (!payload || !Array.isArray(payload.targets)) return;
  if (!payload.targets.includes(game.user.id)) return;

  if (payload.action === "show") showParchment(payload);
  if (payload.action === "hide") hideParchment();
}

function hideParchment() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  overlay.classList.add("pp-closing");
  window.setTimeout(() => overlay.remove(), 350);
}

async function showParchment(payload) {
  document.getElementById(OVERLAY_ID)?.remove();

  const font = await resolvePayloadFont(payload);
  const fontSize = clampNumber(payload.fontSize, 18, 120, 48);
  const duration = clampNumber(payload.duration, 0, 300, 0);
  const textColor = validColor(payload.textColor) ? payload.textColor : "#3c2415";
  const background = String(payload.background || DEFAULT_BACKGROUND).trim() || DEFAULT_BACKGROUND;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "private-parchment-overlay";

  const frame = document.createElement("div");
  frame.className = "pp-frame";
  frame.style.setProperty("--pp-font-size", `${fontSize}px`);
  frame.style.setProperty("--pp-font-family", font.family);
  frame.style.setProperty("--pp-text-color", textColor);

  const media = createBackgroundMedia(background);
  frame.append(media);

  const text = document.createElement("div");
  text.className = "pp-message";
  text.textContent = String(payload.text ?? "");
  frame.append(text);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "pp-close";
  close.title = "关闭";
  close.setAttribute("aria-label", "关闭");
  close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  close.addEventListener("click", hideParchment);
  frame.append(close);

  overlay.append(frame);
  document.body.append(overlay);

  requestAnimationFrame(() => overlay.classList.add("pp-visible"));

  if (duration > 0) {
    window.setTimeout(() => {
      if (document.getElementById(OVERLAY_ID) === overlay) hideParchment();
    }, duration * 1000);
  }
}

function createBackgroundMedia(path) {
  const cleanPath = path.split("?")[0].split("#")[0].toLowerCase();

  if (cleanPath.endsWith(".webm") || cleanPath.endsWith(".mp4")) {
    const video = document.createElement("video");
    video.className = "pp-background";
    video.src = path;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    return video;
  }

  const image = document.createElement("img");
  image.className = "pp-background";
  image.src = path;
  image.alt = "";
  return image;
}

async function openComposer() {
  if (!game.user.isGM) {
    ui.notifications.error("只有 GM 可以发送私密羊皮纸消息。");
    return;
  }

  document.getElementById(COMPOSER_ID)?.remove();

  const players = getUsers()
    .filter(user => !user.isGM)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "zh-CN"));
  let availableFonts = await getAvailableFonts();

  if (!players.length) {
    ui.notifications.warn("世界中没有玩家用户。");
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.id = COMPOSER_ID;
  backdrop.className = "pp-composer-backdrop";

  const panel = document.createElement("form");
  panel.className = "pp-composer";
  panel.innerHTML = `
    <header>
      <h2><i class="fa-solid fa-scroll"></i> 发送私密羊皮纸</h2>
      <button type="button" class="pp-composer-x" data-action="cancel" aria-label="关闭">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </header>

    <label class="pp-field">
      <span>显示文字</span>
      <textarea name="text" rows="7" required placeholder="在这里粘贴提前准备好的文本……"></textarea>
    </label>

    <fieldset class="pp-player-fieldset">
      <legend>接收玩家（可多选）</legend>
      <div class="pp-player-tools">
        <button type="button" data-action="select-active">选择在线玩家</button>
        <button type="button" data-action="clear-selection">清空选择</button>
      </div>
      <div class="pp-player-list"></div>
    </fieldset>

    <div class="pp-grid">
      <label class="pp-field">
        <span>字体</span>
        <div class="pp-font-row">
          <select name="font"></select>
          <button type="button" data-action="refresh-fonts" title="重新扫描自定义字体目录">
            <i class="fa-solid fa-rotate"></i>
          </button>
        </div>
        <small class="pp-font-hint">
          自定义字体目录：${CUSTOM_FONT_DIR}
        </small>
      </label>

      <label class="pp-field">
        <span>字号（px）</span>
        <input name="fontSize" type="number" min="18" max="120" value="48">
      </label>

      <label class="pp-field">
        <span>文字颜色</span>
        <input name="textColor" type="color" value="#3c2415">
      </label>

      <label class="pp-field">
        <span>自动关闭（秒，0=不自动）</span>
        <input name="duration" type="number" min="0" max="300" value="0">
      </label>
    </div>

    <label class="pp-field">
      <span>羊皮纸图片或 WebM 路径</span>
      <input name="background" type="text" value="${DEFAULT_BACKGROUND}">
    </label>

    <label class="pp-preview-option">
      <input name="previewForGM" type="checkbox">
      同时在 GM 自己的屏幕预览
    </label>

    <footer>
      <button type="button" data-action="hide">
        <i class="fa-solid fa-eye-slash"></i> 清除所选玩家画面
      </button>
      <span class="pp-footer-spacer"></span>
      <button type="button" data-action="cancel">取消</button>
      <button type="submit" class="pp-primary">
        <i class="fa-solid fa-paper-plane"></i> 发送
      </button>
    </footer>
  `;

  const playerList = panel.querySelector(".pp-player-list");
  for (const user of players) {
    const label = document.createElement("label");
    label.className = "pp-player";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "targets";
    checkbox.value = user.id;
    checkbox.checked = user.active;

    const status = document.createElement("span");
    status.className = `pp-status ${user.active ? "online" : "offline"}`;

    const name = document.createElement("span");
    name.textContent = user.name;

    const state = document.createElement("small");
    state.textContent = user.active ? "在线" : "离线";

    label.append(checkbox, status, name, state);
    playerList.append(label);
  }

  populateFontSelect(panel.elements.font, availableFonts);

  panel.addEventListener("click", async event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "cancel") backdrop.remove();

    if (action === "select-active") {
      for (const input of panel.querySelectorAll('input[name="targets"]')) {
        input.checked = Boolean(game.users.get(input.value)?.active);
      }
    }

    if (action === "clear-selection") {
      for (const input of panel.querySelectorAll('input[name="targets"]')) input.checked = false;
    }

    if (action === "refresh-fonts") {
      const button = event.target.closest("[data-action]");
      const previous = panel.elements.font.value;
      button.disabled = true;

      try {
        availableFonts = await getAvailableFonts({ refresh: true });
        populateFontSelect(panel.elements.font, availableFonts, previous);
        ui.notifications.info(`已找到 ${availableFonts.filter(font => font.custom).length} 个自定义字体。`);
      } finally {
        button.disabled = false;
      }
    }

    if (action === "hide") {
      const targets = selectedTargets(panel);
      if (!targets.length) return ui.notifications.warn("请至少选择一个玩家。");
      game.socket.emit(SOCKET_NAME, { action: "hide", targets });
      ui.notifications.info(`已向 ${targets.length} 名玩家发送清除指令。`);
    }
  });

  panel.addEventListener("submit", event => {
    event.preventDefault();

    const targets = selectedTargets(panel);
    const text = panel.elements.text.value.trim();

    if (!targets.length && !panel.elements.previewForGM.checked) {
      return ui.notifications.warn("请至少选择一个玩家，或勾选 GM 本地预览。");
    }
    if (!text) return ui.notifications.warn("请输入要显示的文字。");

    const selectedFont = availableFonts.find(font => font.id === panel.elements.font.value)
      ?? availableFonts[0];
    const payload = {
      action: "show",
      targets,
      text,
      font: selectedFont.id,
      fontSpec: selectedFont.custom ? {
        label: selectedFont.label,
        family: selectedFont.family,
        src: selectedFont.src
      } : null,
      fontSize: clampNumber(panel.elements.fontSize.value, 18, 120, 48),
      textColor: panel.elements.textColor.value,
      duration: clampNumber(panel.elements.duration.value, 0, 300, 0),
      background: panel.elements.background.value.trim() || DEFAULT_BACKGROUND
    };

    if (targets.length) game.socket.emit(SOCKET_NAME, payload);
    if (panel.elements.previewForGM.checked) showParchment(payload);

    const resultText = targets.length
      ? `羊皮纸消息已发送给 ${targets.length} 名玩家。`
      : "已在 GM 屏幕本地预览。";
    ui.notifications.info(resultText);
    backdrop.remove();
  });

  backdrop.addEventListener("mousedown", event => {
    if (event.target === backdrop) backdrop.remove();
  });

  backdrop.append(panel);
  document.body.append(backdrop);
  panel.elements.text.focus();
}

function selectedTargets(panel) {
  return [...panel.querySelectorAll('input[name="targets"]:checked')].map(input => input.value);
}

function getUsers() {
  const users = game.users?.contents ?? game.users ?? [];
  return Array.from(users);
}

let fontScanPromise = null;

async function getAvailableFonts({ refresh = false } = {}) {
  if (!refresh && fontScanPromise) return fontScanPromise;

  fontScanPromise = (async () => {
    const builtins = Object.entries(BUILTIN_FONTS).map(([id, font]) => ({
      id,
      label: font.label,
      family: font.family,
      custom: false
    }));

    const custom = await scanCustomFonts();
    return [...builtins, ...custom];
  })();

  return fontScanPromise;
}

async function scanCustomFonts() {
  const manifest = await readFontManifest();
  const manifestByFile = new Map(
    manifest.map(entry => [normalizePath(entry.file).toLowerCase(), entry])
  );
  let files = [];

  try {
    files = await browseFontDirectory();
  } catch (error) {
    console.warn(`${MODULE_ID} | 无法自动扫描字体目录，将使用 fonts.json。`, error);
  }

  for (const entry of manifest) {
    const path = resolveCustomFontPath(entry.file);
    if (path) files.push(path);
  }

  const unique = [...new Set(files.map(file => normalizePath(file).replace(/^\/+/, "")))]
    .filter(isSupportedFontFile)
    .sort((a, b) => getFileStem(a).localeCompare(getFileStem(b), "zh-CN"));

  return unique.map(path => {
    const relative = path.startsWith(`${CUSTOM_FONT_DIR}/`)
      ? path.slice(CUSTOM_FONT_DIR.length + 1)
      : path;
    const override = manifestByFile.get(relative.toLowerCase())
      ?? manifestByFile.get(path.toLowerCase());
    const label = override?.label?.trim() || getFileStem(path);
    const id = `custom:${stableHash(path)}`;

    return {
      id,
      label: `${label}（自定义）`,
      family: `Private Parchment ${stableHash(path)}`,
      src: path,
      custom: true
    };
  });
}

async function browseFontDirectory() {
  const candidates = [
    globalThis.FilePicker,
    foundry.applications?.apps?.FilePicker?.implementation,
    foundry.applications?.apps?.FilePicker
  ].filter(Boolean);
  const browseOwner = candidates.find(candidate => typeof candidate.browse === "function");

  if (!browseOwner) throw new Error("当前 Foundry 版本未提供可用的 FilePicker.browse。");

  let lastError;
  for (const source of ["data", "public"]) {
    try {
      const result = await browseOwner.browse(source, CUSTOM_FONT_DIR);
      return Array.from(result?.files ?? []);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("字体目录扫描失败。");
}

async function readFontManifest() {
  try {
    const response = await fetch(`${CUSTOM_FONT_MANIFEST}?v=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map(entry => {
      if (typeof entry === "string") return { file: entry, label: "" };
      return {
        file: String(entry?.file ?? ""),
        label: String(entry?.label ?? "")
      };
    }).filter(entry => entry.file);
  } catch {
    return [];
  }
}

function resolveCustomFontPath(file) {
  const clean = normalizePath(file).replace(/^\/+/, "");
  if (!clean || clean.includes("..")) return null;
  if (clean.startsWith(`${CUSTOM_FONT_DIR}/`)) return clean;
  return `${CUSTOM_FONT_DIR}/${clean}`;
}

function populateFontSelect(select, fonts, selectedId = "builtin:brush") {
  select.replaceChildren();

  const builtinGroup = document.createElement("optgroup");
  builtinGroup.label = "内置字体";
  const customGroup = document.createElement("optgroup");
  customGroup.label = "自定义字体";

  for (const font of fonts) {
    const option = new Option(font.label, font.id);
    (font.custom ? customGroup : builtinGroup).append(option);
  }

  select.append(builtinGroup);

  if (customGroup.children.length) {
    select.append(customGroup);
  }

  const exists = fonts.some(font => font.id === selectedId);
  select.value = exists ? selectedId : fonts[0]?.id ?? "";
}

async function resolvePayloadFont(payload) {
  if (payload?.fontSpec?.src) {
    const loaded = await loadCustomFont(payload.fontSpec);
    if (loaded) return loaded;
  }

  return BUILTIN_FONTS[payload?.font]
    ?? BUILTIN_FONTS[normalizeLegacyFontId(payload?.font)]
    ?? BUILTIN_FONTS["builtin:brush"];
}

async function loadCustomFont(spec) {
  const src = normalizePath(spec.src);
  if (!isAllowedCustomFontPath(src) || !isSupportedFontFile(src)) {
    console.warn(`${MODULE_ID} | 拒绝加载无效的自定义字体路径：${src}`);
    return null;
  }

  const family = String(spec.family || `Private Parchment ${stableHash(src)}`)
    .replace(/["\\]/g, "")
    .slice(0, 100);
  const cached = CUSTOM_FONT_CACHE.get(src);

  if (cached) {
    await cached.catch(() => {});
    return { family: `"${family}", sans-serif` };
  }

  const loading = (async () => {
    const face = new FontFace(family, `url("${encodeURI(src)}")`, {
      style: "normal",
      weight: "normal",
      display: "swap"
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
  })();

  CUSTOM_FONT_CACHE.set(src, loading);

  try {
    await loading;
    return { family: `"${family}", sans-serif` };
  } catch (error) {
    CUSTOM_FONT_CACHE.delete(src);
    console.error(`${MODULE_ID} | 自定义字体加载失败：${src}`, error);
    ui.notifications.warn(`自定义字体加载失败，将使用默认字体：${spec.label ?? getFileStem(src)}`);
    return null;
  }
}

function normalizeLegacyFontId(id) {
  const legacy = {
    brush: "builtin:brush",
    kaiti: "builtin:kaiti",
    song: "builtin:song",
    fantasy: "builtin:fantasy",
    script: "builtin:script"
  };
  return legacy[id] ?? id;
}

function normalizePath(path) {
  const value = String(path ?? "").replaceAll("\\", "/");
  try {
    return decodeURI(value).replace(/\/+/g, "/");
  } catch {
    return value.replace(/\/+/g, "/");
  }
}

function isAllowedCustomFontPath(path) {
  return path.startsWith(`${CUSTOM_FONT_DIR}/`) && !path.includes("..");
}

function isSupportedFontFile(path) {
  const extension = path.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  return FONT_EXTENSIONS.has(extension);
}

function getFileStem(path) {
  const filename = normalizePath(path).split("/").pop() ?? "自定义字体";
  return filename.replace(/\.[^.]+$/, "").replaceAll("_", " ").replaceAll("-", " ");
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function validColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value));
}
