/*:
 * @target MZ
 * @plugindesc AQW active/passive skill separation and turn-based cooldowns.
 * @help
 * Skill notes:
 * <AQWSkillType: Active|Passive|Basic|EnemyOnly|Internal>
 * <AQWCooldownTurns: N>
 * Cooldowns are stored per battler and expire after N battle turns.
 */
(() => {
 "use strict";
 const cooldownTurns=skill=>{
  const m=skill&&skill.note&&skill.note.match(/<AQWCooldownTurns:\s*(\d+)>/i);
  return m?Number(m[1]):0;
 };
 const type=skill=>{
  const m=skill&&skill.note&&skill.note.match(/<AQWSkillType:\s*(Active|Passive|Basic|EnemyOnly|Internal)>/i);
  return m?m[1].toLowerCase():"active";
 };
 const actorSkills=Game_Actor.prototype.skills;
 Game_Actor.prototype.skills=function(){
  return actorSkills.call(this).filter(skill=>skill.stypeId!==2&&!["passive","enemyonly","internal"].includes(type(skill)));
 };
 const currentTurn=()=>($gameTroop?$gameTroop.turnCount():0);
 const remaining=(battler,id)=>Math.max(0,((battler._aqwSkillCooldowns||{})[id]||0)-currentTurn());
 const meets=Game_BattlerBase.prototype.meetsSkillConditions;
 Game_BattlerBase.prototype.meetsSkillConditions=function(skill){
  if(!meets.call(this,skill))return false;
  return type(skill)!=="active"||remaining(this,skill.id)<=0;
 };
 const pay=Game_BattlerBase.prototype.paySkillCost;
 Game_BattlerBase.prototype.paySkillCost=function(skill){
  pay.call(this,skill);
  const duration=cooldownTurns(skill);
  if(duration>0){
   this._aqwSkillCooldowns=this._aqwSkillCooldowns||{};
   this._aqwSkillCooldowns[skill.id]=currentTurn()+duration;
  }
 };
 Window_ActorCommand.prototype.addGuardCommand=function(){};
 const draw=Window_SkillList.prototype.drawItem;
 Window_SkillList.prototype.drawItem=function(index){
  const skill=this.itemAt(index);
  const left=skill&&this._actor?remaining(this._actor,skill.id):0;
  if(skill&&left>0){
   const rect=this.itemLineRect(index);
   this.changePaintOpacity(false);
   this.drawItemName(skill,rect.x,rect.y,rect.width-48);
   this.drawText(left+"T",rect.x,rect.y,rect.width,"right");
   this.changePaintOpacity(true);
   return;
  }
  draw.call(this,index);
 };

 // Skill Type 2 is the passive category. Apply each learned passive once
 // at battle start, using its database scope and effects without damage,
 // costs, cooldowns, battle-log actions, or turn consumption.
 const startBattle=BattleManager.startBattle;
 BattleManager.startBattle=function(){
  startBattle.call(this);
  for(const actor of $gameParty.battleMembers()){
   const passives=$dataSkills.filter(skill=>
    skill&&skill.stypeId===2&&actor.isLearnedSkill(skill.id)
   );
   for(const skill of passives){
    const action=new Game_Action(actor);
    action.setSkill(skill.id);
    const targets=[...new Set(action.makeTargets())];
    for(const target of targets){
     target.clearResult();
     for(const effect of skill.effects){
      action.applyItemEffect(target,effect);
     }
     action.applyItemUserEffect(target);
    }
   }
  }
 };
})();
