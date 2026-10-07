/* ===================================================================
   引爆疯狂  ·  Detonate Madness  （宏 / Macro）
   -------------------------------------------------------------------
   使用方法：在 Foundry 里新建一个【脚本 / Script】类型的宏，
            把本文件整段内容粘进去保存即可。不要作为模组脚本加载。
   -------------------------------------------------------------------
   特性：
   - 框选 token → 执行 → 弹窗（只列出身上有「疯狂」的目标，默认全选满层）
   - 每层疯狂掷 1d10+1 心灵伤害，扣血并减少对应层数，0 层时删除效果
   - 自给自足：伤害结算完全不依赖 madness-fx 模块；
              模块禁用 / 未安装 / 玩家离线，宏都照常跑完，只是没特效
   - 配合 madness-fx 模块时：引爆瞬间在对应玩家屏幕放血焰特效
   =================================================================== */

// 读模组设置，失败则用兜底值（保证模块禁用/未装时宏照常运行）
const cfg = (key, fb) => { try { return game.settings.get("madness-fx", key); } catch { return fb; } };

const MADNESS_NAME = cfg("madnessName", "疯狂");
const SOURCE_UUID  = cfg("sourceUuid",  "Item.DB8wpJ89GiPsid2G.ActiveEffect.gK2zxsMSaJqzjFFT");
const PER_STACK    = cfg("perStackFormula", "1d10+1");
const DAMAGE_TYPE  = cfg("damageType",  "psychic");
const AUTO_APPLY   = cfg("autoApply",   true);
const ALSO_SHOW_GM = cfg("alsoShowGM",  false);
const FX_ENABLED   = cfg("enabled",     true);

// ── 工具函数 ──
function getMadnessEffects(actor){
  if(!actor) return [];
  return actor.effects.filter(e=>{
    const nameHit=(e.name??"").includes(MADNESS_NAME);
    const srcHit = e.origin===SOURCE_UUID || e.origin==="Item.DB8wpJ89GiPsid2G"
                || foundry.utils.getProperty(e,"flags.core.sourceId")===SOURCE_UUID;
    return nameHit||srcHit;
  });
}
function getStacks(e){
  const dae=foundry.utils.getProperty(e,"flags.dae.stacks");
  if(typeof dae==="number"&&dae>0) return dae;
  const sc=foundry.utils.getProperty(e,"flags.statuscounter.value")
        ?? foundry.utils.getProperty(e,"flags.statuscounter.counter");
  if(typeof sc==="number"&&sc>0) return sc;
  return 1;
}
function totalStacks(actor){ return getMadnessEffects(actor).reduce((s,e)=>s+getStacks(e),0); }
async function detonateStacks(actor,count){
  let left=count; const updates=[],deletes=[];
  for(const e of getMadnessEffects(actor)){
    if(left<=0) break;
    const s=getStacks(e);
    if(s>left){ updates.push({_id:e.id,"flags.dae.stacks":s-left}); left=0; }
    else      { deletes.push(e.id); left-=s; }
  }
  if(updates.length) await actor.updateEmbeddedDocuments("ActiveEffect",updates);
  if(deletes.length) await actor.deleteEmbeddedDocuments("ActiveEffect",deletes);
}
async function blast(token,stacks){
  const formula = Array.from({length:stacks}, () => `(${PER_STACK})`).join(" + ");
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker:ChatMessage.getSpeaker({token:token.document}),
                         flavor:`疯狂引爆 ×${stacks} 层 → ${DAMAGE_TYPE} 伤害` });
  if(AUTO_APPLY){
    try{ await token.actor.applyDamage([{value:roll.total,type:DAMAGE_TYPE}]); }
    catch{ try{ await token.actor.applyDamage(roll.total); }
      catch{ const hp=token.actor.system.attributes.hp;
        await token.actor.update({"system.attributes.hp.value":Math.max(0,hp.value-roll.total)}); } }
  }
  return roll.total;
}
function ownerUserIds(actor){
  return game.users.filter(u=>u.active && !u.isGM && actor.testUserPermission(u,"OWNER")).map(u=>u.id);
}

// ── 主流程 ──
const selected=canvas.tokens.controlled;
if(!selected.length){ ui.notifications.warn("请先框选至少一个 token。"); return; }

const seen=new Set(); const entries=[];
for(const token of selected){
  if(!token.actor) continue;
  if(seen.has(token.actor.uuid)) continue;
  const max=totalStacks(token.actor);
  if(max>0){ seen.add(token.actor.uuid); entries.push({token,max}); }
}
if(!entries.length){ ui.notifications.warn("框选的 token 中没有携带「疯狂」的目标。"); return; }

const rows=entries.map((en,i)=>{
  const opts=Array.from({length:en.max},(_,k)=>k+1)
    .map(n=>`<option value="${n}" ${n===en.max?"selected":""}>${n}</option>`).join("");
  return `<tr>
    <td style="text-align:center;"><input type="checkbox" class="m-chk" data-i="${i}" checked></td>
    <td>${en.token.name}</td>
    <td style="text-align:center;">${en.max}</td>
    <td style="text-align:center;"><select class="m-cnt" data-i="${i}">${opts}</select></td>
  </tr>`;
}).join("");

const content=`<form>
  <p style="margin:.25rem 0;">选择要引爆的目标与层数（默认全选 · 满层引爆）：</p>
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr style="border-bottom:1px solid #999;">
      <th style="width:46px;">引爆</th><th style="text-align:left;">目标</th>
      <th style="width:64px;">当前</th><th style="width:90px;">引爆层数</th>
    </tr></thead><tbody>${rows}</tbody>
  </table></form>`;

new Dialog({
  title:"引爆疯狂 · Detonate Madness", content,
  buttons:{
    go:{ icon:'<i class="fas fa-bomb"></i>', label:"引爆",
      callback: async (html)=>{
        const jobs=[];
        html.find(".m-chk").each(function(){
          if(!this.checked) return;
          const i=Number(this.dataset.i);
          const n=Number(html.find(`.m-cnt[data-i="${i}"]`).val());
          jobs.push({...entries[i], count:n});
        });
        if(!jobs.length){ ui.notifications.info("未选择任何目标。"); return; }

        const log=[];
        for(const job of jobs){
          // —— 核心结算：不依赖任何模块 ——
          const dmg=await blast(job.token, job.count);
          await detonateStacks(job.token.actor, job.count);
          log.push(`${job.token.name}：引爆 ${job.count} 层 → ${dmg} ${DAMAGE_TYPE} 伤害`);

          // —— FX 触发：完全隔离，失败绝不影响上面的结算 ——
          if(FX_ENABLED){
            try{
              const fx = game.modules.get("madness-fx")?.api?.socket?.();
              if(fx){
                const uids = ownerUserIds(job.token.actor);
                const targets = uids.length ? uids : (ALSO_SHOW_GM ? [game.user.id] : []);
                if(targets.length){
                  Promise.resolve(fx.executeForUsers("playMadness", targets, { stacks: job.count }))
                    .catch(err => console.warn("madness-fx | dispatch failed:", err));
                }
              }
            }catch(err){ console.warn("madness-fx | trigger error (ignored):", err); }
          }
        }
        ChatMessage.create({content:`<b>💥 疯狂引爆结果</b><br>${log.join("<br>")}`});
      }},
    cancel:{ icon:'<i class="fas fa-times"></i>', label:"取消" }
  },
  default:"go"
},{width:480}).render(true);
