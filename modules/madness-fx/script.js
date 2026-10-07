/* ===================================================================
 * 中文说明：注册 Madness FX 设置与 socket 接收端，并仅在目标玩家客户端绘制屏幕特效。
 * 伤害／疯狂层数由配套宏结算；本文件负责视觉呈现和清理，不自行重复结算。
 * =================================================================== */
/* ===================================================================
   Madness FX  ·  引爆疯狂视觉
   V12 / dnd5e 3.3.1 / 依赖 socketlib
   - init 中注册全部设置（配置设置 → 模组设置 → Madness FX）
   - socketlib 收到指令后在对应玩家客户端渲染特效
   - 特效：烙铁烧灼闪光转场 → 血焰滤镜 + 文字，强度随引爆层数递增
   =================================================================== */

const MOD = "madness-fx";
const DEFAULT_TEXT = "你突然感觉灼热的痛感突兀地出现在头颅里，就好像一根烧红的烙铁深入你的大脑";

const DMG_CHOICES = {
  psychic:"psychic 心灵", force:"force 力场", fire:"fire 火焰", cold:"cold 冷冻",
  necrotic:"necrotic 死灵", radiant:"radiant 光耀", lightning:"lightning 闪电",
  thunder:"thunder 雷鸣", acid:"acid 强酸", poison:"poison 毒素",
  bludgeoning:"bludgeoning 钝击", piercing:"piercing 穿刺", slashing:"slashing 挥砍"
};

/* ───────── 设置注册 ───────── */
Hooks.once("init", () => {
  const reg = (key, data) => game.settings.register(MOD, key, { scope:"world", config:true, ...data });

  reg("enabled", { name:"【总开关】启用引爆特效", hint:"关闭后引爆仍正常结算，只是不放屏幕特效。",
    type:Boolean, default:true });

  // ── 视觉 ──
  reg("text", { name:"【视觉】灼烧文字", hint:"引爆时浮现在玩家屏幕下方的文字。",
    type:String, default:DEFAULT_TEXT });
  reg("duration", { name:"【视觉】特效总时长", hint:"毫秒。整段特效从出现到完全消失。",
    type:Number, default:6500, range:{ min:2500, max:15000, step:500 } });
  reg("fadeOut", { name:"【视觉】淡出时长", hint:"毫秒。结尾淡出的时间。",
    type:Number, default:1800, range:{ min:500, max:5000, step:100 } });
  reg("enableBurnFlash", { name:"【视觉】烙铁烧灼闪光转场", hint:"引爆瞬间先爆一下白热→赤红的灼烧闪光，再进血焰。",
    type:Boolean, default:true });
  reg("enableDistortion", { name:"【视觉】画布热浪扭曲", hint:"画面热浪般扭曲。光照/视野模组下若发卡可关闭。",
    type:Boolean, default:true });
  reg("enableShake", { name:"【视觉】震屏", hint:"引爆时画布轻微抖动。",
    type:Boolean, default:true });
  reg("intensityScaling", { name:"【视觉】强度随层数递增", hint:"开：1 层隐隐泛红、满层满屏血焰。关：每次都满强度。",
    type:Boolean, default:true });
  reg("maxIntensityStacks", { name:"【视觉】满强度所需层数", hint:"引爆达到该层数即为最强效果。",
    type:Number, default:5, range:{ min:1, max:10, step:1 } });

  // ── 伤害（引爆宏读取，带兜底）──
  reg("madnessName", { name:"【伤害】疯狂效果名（匹配）", hint:"按名字含此子串识别效果。",
    type:String, default:"疯狂" });
  reg("sourceUuid", { name:"【伤害】疯狂效果来源 UUID", hint:"辅助识别效果来源。",
    type:String, default:"Item.DB8wpJ89GiPsid2G.ActiveEffect.gK2zxsMSaJqzjFFT" });
  reg("perStackFormula", { name:"【伤害】每层伤害骰", hint:"每 1 层疯狂造成的伤害公式。",
    type:String, default:"1d10+1" });
  reg("damageType", { name:"【伤害】伤害类型", type:String, default:"psychic", choices:DMG_CHOICES });
  reg("autoApply", { name:"【伤害】自动扣血", hint:"关闭则只掷骰发到聊天，由你手动点伤害。",
    type:Boolean, default:true });
  reg("alsoShowGM", { name:"【伤害】无玩家归属目标也给GM放特效", hint:"引爆 NPC 时在你自己屏幕预览一次。",
    type:Boolean, default:false });
});

/* ───────── socket 注册 ───────── */
let madnessSocket;
Hooks.once("socketlib.ready", () => {
  madnessSocket = socketlib.registerModule(MOD);
  madnessSocket.register("playMadness", playMadnessOverlay);
});
Hooks.once("ready", () => {
  const mod = game.modules.get(MOD);
  if (mod) mod.api = { socket: () => madnessSocket };
});

/* ───────── 特效本体（在被通知到的客户端执行）───────── */
function playMadnessOverlay(data = {}) {
  const s = (key, fb) => { try { return game.settings.get(MOD, key); } catch { return fb; } };
  if (!s("enabled", true)) return;

  const text          = data.text ?? s("text", DEFAULT_TEXT);
  const duration      = data.duration ?? s("duration", 6500);
  const fadeOut       = s("fadeOut", 1800);
  const enableBurn    = s("enableBurnFlash", true);
  const enableDistort = s("enableDistortion", true);
  const enableShake   = s("enableShake", true);
  const scaling       = s("intensityScaling", true);
  const maxStacks     = Math.max(1, s("maxIntensityStacks", 5));
  const stacks        = Math.max(1, data.stacks ?? maxStacks);

  // 强度 0.22~1：1 层隐隐泛红，满层满屏血焰
  const intensity = scaling ? Math.max(0.22, Math.min(1, stacks / maxStacks)) : 1;
  const flashOp   = (0.55 + 0.45 * intensity).toFixed(3);

  // 清理上一次残留
  const board = document.getElementById("board");
  document.getElementById("madness-overlay")?.remove();
  document.getElementById("madness-style")?.remove();
  document.getElementById("madness-distort-svg")?.remove();
  if (board) board.style.filter = "";

  // ① 画布热浪扭曲（含引爆瞬间的位移尖峰，与闪光同步）
  if (enableDistort && board) {
    try {
      const dSpike  = (46 * intensity).toFixed(1);
      const dSettle = (14 * intensity).toFixed(1);
      const dSwell  = (24 * intensity).toFixed(1);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = "madness-distort-svg";
      svg.setAttribute("style", "position:fixed;width:0;height:0;");
      svg.innerHTML = `
        <defs>
          <filter id="madness-distort">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="2" seed="7" result="n">
              <animate attributeName="baseFrequency" dur="8s"
                       values="0.004 0.010;0.012 0.024;0.004 0.010" repeatCount="indefinite"/>
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" xChannelSelector="R" yChannelSelector="G" scale="0">
              <animate attributeName="scale" dur="${duration}ms"
                       values="0;${dSpike};${dSettle};${dSwell};0"
                       keyTimes="0;0.03;0.12;0.8;1" repeatCount="1"/>
            </feDisplacementMap>
          </filter>
        </defs>`;
      document.body.appendChild(svg);
      board.style.filter = "url(#madness-distort)";
    } catch (e) { console.warn("madness-fx | distortion failed:", e); }
  }

  // ② 叠层：血焰背景 + 暗角 +（闪光转场）+ 文字
  const ov = document.createElement("div");
  ov.id = "madness-overlay";
  ov.style.setProperty("--i", intensity.toFixed(3));
  ov.style.setProperty("--flash", flashOp);
  ov.innerHTML = `
    <div class="mad-bg"><div class="mad-flames"></div><div class="mad-vignette"></div></div>
    ${enableBurn ? '<div class="mad-burnflash"></div><div class="mad-scorch"></div>' : ''}
    <div class="mad-text">${text}</div>`;

  const style = document.createElement("style");
  style.id = "madness-style";
  style.textContent = `
  #madness-overlay{position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:0;--i:1;--flash:1;}
  #madness-overlay.mad-in{opacity:1;transition:opacity 150ms ease-out;}
  #madness-overlay.mad-out{opacity:0;transition:opacity ${fadeOut}ms ease-in;}

  .mad-bg{position:absolute;inset:0;opacity:0;animation:madBgIn 1600ms ease forwards;}
  @keyframes madBgIn{from{opacity:0;}to{opacity:1;}}

  .mad-vignette{position:absolute;inset:0;mix-blend-mode:multiply;
    background:radial-gradient(ellipse at center,
      rgba(0,0,0,0) 30%, rgba(90,0,0,calc(.45*var(--i))) 66%, rgba(30,0,0,calc(.92*var(--i))) 100%);}

  .mad-flames{position:absolute;inset:-20%;mix-blend-mode:screen;
    filter:blur(2px) saturate(calc(1 + .8*var(--i)));
    background:repeating-linear-gradient(6deg,
      rgba(180,0,0,0) 0px, rgba(210,25,0,.22) 12px, rgba(120,0,0,0) 27px, rgba(255,45,0,.13) 42px);
    animation:madFlicker .16s steps(2) infinite, madRise 6s linear infinite;}
  @keyframes madFlicker{0%{opacity:calc(.7*var(--i));}100%{opacity:var(--i);}}
  @keyframes madRise{from{background-position:0 0;}to{background-position:0 -420px;}}

  .mad-burnflash{position:absolute;inset:0;mix-blend-mode:screen;opacity:0;
    background:radial-gradient(circle at 50% 48%,
      rgba(255,250,235,.95) 0%, rgba(255,170,40,.9) 18%, rgba(230,40,0,.75) 38%,
      rgba(120,0,0,.2) 60%, transparent 75%);
    animation:madBurn 900ms ease-out forwards;}
  @keyframes madBurn{
    0%{opacity:0;transform:scale(.35);}
    12%{opacity:var(--flash);transform:scale(1.05);}
    30%{opacity:calc(.7*var(--flash));transform:scale(1.15);}
    100%{opacity:0;transform:scale(1.5);}}

  .mad-scorch{position:absolute;left:50%;top:48%;width:40vmax;height:40vmax;
    transform:translate(-50%,-50%) scale(.2);border-radius:50%;mix-blend-mode:screen;opacity:0;
    background:radial-gradient(circle,transparent 54%,rgba(255,90,0,.55) 60%,rgba(120,0,0,.3) 66%,transparent 72%);
    animation:madScorch 1000ms ease-out forwards;}
  @keyframes madScorch{
    0%{opacity:0;transform:translate(-50%,-50%) scale(.15);}
    20%{opacity:calc(.8*var(--flash));}
    100%{opacity:0;transform:translate(-50%,-50%) scale(2.2);}}

  .mad-text{position:absolute;left:50%;bottom:14%;transform:translateX(-50%);max-width:62%;text-align:center;
    font-family:"Noto Serif SC","Songti SC","STSong",serif;font-size:clamp(18px,2.2vw,30px);line-height:1.7;
    letter-spacing:.06em;color:#ffe3e3;text-shadow:0 0 6px #f00,0 0 18px #8b0000,0 2px 2px #000;
    opacity:0;animation:madTextIn 2s ease forwards .7s;}
  @keyframes madTextIn{from{opacity:0;filter:blur(8px);transform:translateX(-50%) scale(.96);}
    to{opacity:1;filter:blur(0);transform:translateX(-50%) scale(1);}}`;

  document.body.appendChild(style);
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("mad-in"));

  // ③ 震屏（强度越高抖得越狠）
  if (enableShake && board) {
    const m = Math.round(2 + 3 * intensity);
    board.animate(
      [{transform:"translate(0,0)"},{transform:`translate(${m}px,-${m-1}px)`},
       {transform:`translate(-${m}px,${m-1}px)`},{transform:"translate(0,0)"}],
      { duration:120, iterations: Math.max(1, Math.floor(duration * 0.5 / 120)) });
  }

  // 收尾
  setTimeout(() => { ov.classList.remove("mad-in"); ov.classList.add("mad-out");
                     if (board) board.style.filter = ""; }, Math.max(0, duration - fadeOut));
  setTimeout(() => { ov.remove(); style.remove();
                     document.getElementById("madness-distort-svg")?.remove(); }, duration + 200);
}
