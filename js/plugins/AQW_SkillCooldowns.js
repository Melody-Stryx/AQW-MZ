/*:
 * @target MZ
 * @plugindesc AQW active/passive skill separation and turn-based cooldowns.
 * @help
 * Skill notes:
 * <AQWPassive>
 * <AQWSkillType: Active|Basic|EnemyOnly|Internal>
 * <AQWCooldownTurns: N>
 * Skills with <AQWPassive> are visible in the skill list but cannot be
 * activated manually. Their database effects are applied at battle start.
 * Cooldowns are stored per battler and expire after N battle turns.
 */
(() => {
 "use strict";
 const cooldownTurns=skill=>{
  const m=skill&&skill.note&&skill.note.match(/<AQWCooldownTurns:\s*(\d+)>/i);
  return m?Number(m[1]):0;
 };
 const type=skill=>{
  const m=skill&&skill.note&&skill.note.match(/<AQWSkillType:\s*(Active|Basic|EnemyOnly|Internal)>/i);
  return m?m[1].toLowerCase():"active";
 };
 const isPassive=skill=>!!(skill&&/<AQWPassive>/i.test(skill.note||""));
 const actorSkills=Game_Actor.prototype.skills;
 Game_Actor.prototype.skills=function(){
  return actorSkills.call(this).filter(skill=>!["enemyonly","internal"].includes(type(skill)));
 };
 const currentTurn=()=>($gameTroop?$gameTroop.turnCount():0);
 const remaining=(battler,id)=>Math.max(0,((battler._aqwSkillCooldowns||{})[id]||0)-currentTurn());
 const meets=Game_BattlerBase.prototype.meetsSkillConditions;
 Game_BattlerBase.prototype.meetsSkillConditions=function(skill){
  if(!meets.call(this,skill))return false;
  if(isPassive(skill))return false;
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
  if(skill&&(isPassive(skill)||(this._actor&&remaining(this._actor,skill.id)>0))){
   const rect=this.itemLineRect(index);
   const passive=isPassive(skill);
   const label=passive?"PASSIVE":remaining(this._actor,skill.id)+"T";
   this.changePaintOpacity(!passive);
   this.drawItemName(skill,rect.x,rect.y,rect.width-64);
   this.drawText(label,rect.x,rect.y,rect.width,"right");
   this.changePaintOpacity(true);
   return;
  }
  draw.call(this,index);
 };

 // Apply each learned <AQWPassive> once at battle start, using its database
 // scope and effects without damage, costs, cooldowns, or turn consumption.
 const applyPassives=function(battler,skillIds){
  const passiveIds=[...new Set(skillIds)].filter(id=>{
   const skill=$dataSkills[id];
   return skill&&isPassive(skill);
  });
  for(const skillId of passiveIds){
   const skill=$dataSkills[skillId];
   const action=new Game_Action(battler);
   action.setSkill(skillId);
   const targets=[...new Set(action.makeTargets())];
   for(const target of targets){
    target.clearResult();
    for(const effect of skill.effects){
     action.applyItemEffect(target,effect);
    }
    action.applyItemUserEffect(target);
   }
  }
 };
 const startBattle=BattleManager.startBattle;
 BattleManager.startBattle=function(){
  startBattle.call(this);
  // Cooldowns are battle-local: no battler carries one into a new battle.
  for(const battler of [...$gameParty.members(),...$gameTroop.members()]){
   battler._aqwSkillCooldowns={};
  }
  for(const actor of $gameParty.battleMembers()){
   applyPassives(actor,actor.skills().filter(skill=>isPassive(skill)).map(skill=>skill.id));
  }
  for(const enemy of $gameTroop.members()){
   const skillIds=(enemy.enemy().actions||[]).map(action=>action.skillId);
   applyPassives(enemy,skillIds);
  }
 };
})();
