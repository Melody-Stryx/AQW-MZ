/*:
 * @target MZ
 * @plugindesc AQW class combat effects: damage-over-time, healing-over-time and class interactions.
 */
(() => {
 "use strict";
 const DOT=/<AQWDoT:\s*([^>]+)>/i,HOT=/<AQWHoT:\s*([0-9.]+)>/i;
 const playerDamageMultiplier=()=>Math.max(2,($gameParty.leader()?.level||1)/50);
 const dotFormulaCache=new Map();
 function evaluateDotFormula(expression,caster){
  let formula=dotFormulaCache.get(expression);
  if(!formula){
   formula=new Function("A","return ("+expression+");");
   dotFormulaCache.set(expression,formula);
  }
  const battler=new Proxy(caster,{
   get(target,key){
    if(typeof key==="string"){
     const actual=Object.keys(target).find(name=>name.toLowerCase()===key.toLowerCase());
     if(actual)return target[actual];
     const prototypeValue=target[key]??target[Object.getOwnPropertyNames(Object.getPrototypeOf(target)).find(name=>name.toLowerCase()===key.toLowerCase())];
     return typeof prototypeValue==="function"?prototypeValue.bind(target):prototypeValue;
    }
    return target[key];
   }
  });
  const value=Number(formula(battler));
  return Number.isFinite(value)?Math.max(0,value):0;
 }
 const turnEnd=Game_Battler.prototype.onTurnEnd;
 Game_Battler.prototype.onTurnEnd=function(){
  turnEnd.call(this);
  if(this._aqwDeathMarkStacks&&!this.isStateAffected(41))this._aqwDeathMarkStacks=0;
  if(this._aqwMarkStacks&&!this.isStateAffected(62))this._aqwMarkStacks=0;
  if(this._aqwCutlassStacks&&!this.isStateAffected(66))this._aqwCutlassStacks=0;
  if(!this.isAlive())return;
  for(const st of this.states()){
   const d=st.note.match(DOT),h=st.note.match(HOT);
   if(d||h){
    let amount;
    if(d&&/\\bA\\s*\\./i.test(d[1])){
     const caster=this._aqwDotCasters&&this._aqwDotCasters[st.id]||$gameParty.leader();
     amount=Math.floor(evaluateDotFormula(d[1],caster));
    }else{
     const power=this._aqwEffectPower&&this._aqwEffectPower[st.id]||this.mat;
     amount=Math.floor(power*Number((d||h)[1]));
    }
    amount=Math.max(1,amount);
    if(d){this.gainHp(-amount);this.startDamagePopup();if(this.isDead())this.performCollapse();}
    else{this.gainHp(amount);this.startDamagePopup();}
   }
  }
 };
 const make=Game_Action.prototype.makeDamageValue;
 Game_Action.prototype.makeDamageValue=function(target,critical){
  let value=make.call(this,target,critical);
  const subject=this.subject(),item=this.item();
  if(value>0&&target.isStateAffected(41))value*=1+Math.min(6,target._aqwDeathMarkStacks||1)*0.05;
  if(value>0&&item&&item.id===89&&target.isEnemy()&&/<AQWUndead>/i.test(target.enemy().note||""))value*=2.5;
  if(value>0&&subject.isStateAffected(65))value*=1.10;
  if(value>0&&subject.isStateAffected(37)&&subject._aqwPreparedDouble&&item&&item.id===1)value*=2;
  if(value>0&&subject.isStateAffected(72))value*=0.75;
  if(value>0&&target.isStateAffected(71))value*=1.20;
  if(value>0&&critical&&subject.isStateAffected(66))value*=1+Math.min(5,subject._aqwCutlassStacks||1)*0.07;
  if(value>0&&critical&&subject.isStateAffected(69))value*=1.30;
  if(value>0&&target.isStateAffected(35)&&target.hpRate()<0.40)value*=1.5;
  if(value>0&&target.isStateAffected(34))value*=1.10;
  if(value>0&&target.isStateAffected(36))value*=0.5;
  if(value>0&&target.isStateAffected(46))value*=0.9;
  if(value>0&&target.isStateAffected(61))value*=0.9;
  if(value>0&&target.isStateAffected(54))value*=0.8;
  if(value>0&&target.isStateAffected(52))value*=0.85;
  if(value>0&&subject.isStateAffected(39))value*=0.7;
  if(value>0&&subject.isStateAffected(50)&&item&&item.damage&&item.damage.type===1&&item.id!==1)value*=0.8;
  if(value>0&&subject.isStateAffected(56)&&item&&item.damage&&item.damage.type===1&&item.hitType===2)value*=1.1;
  if(value<0&&subject.isStateAffected(55))value*=1.1;
  if(value>0&&item&&item.id===111&&target.isStateAffected(31)){value*=1.5;target.removeState(31);}
  if(value>0&&item&&[227,229,232].includes(item.id)){
   value*=1+Math.min(6,subject._aqwMarkStacks||0)*0.05;
  }
  if(value>0)value*=playerDamageMultiplier();
  return Math.round(value);
 };
 const makeTargets=Game_Action.prototype.makeTargets;
 Game_Action.prototype.makeTargets=function(){
  const targets=makeTargets.call(this);
  return this.item()&&[226,227,229,232,235].includes(this.item().id)?targets.slice(0,2):targets;
 };
 const hpDamage=Game_Action.prototype.executeHpDamage;
 Game_Action.prototype.executeHpDamage=function(target,value){
  if(value>0&&target.isStateAffected(50)){
   const mpDrain=Math.min(target.mp,Math.floor(value*0.8));
   if(mpDrain>0){target.gainMp(-mpDrain);value-=mpDrain;}
  }
  hpDamage.call(this,target,value);
 };
 const eva=Game_Action.prototype.itemEva;

 Game_Action.prototype.itemEva=function(target){

  const subject=this.subject();

  return subject.isStateAffected(37)&&this.isAttack()?0:eva.call(this,target);

 };

 const cri=Game_Action.prototype.itemCri;
 Game_Action.prototype.itemCri=function(target){
  const rate=cri.call(this,target);
  const subject=this.subject();
  if(subject.isStateAffected(37)&&this.isAttack())return 1;
  return Math.min(1,rate+(subject.isStateAffected(66)?Math.min(5,subject._aqwCutlassStacks||1)*0.03:0));
 };
 const apply=Game_Action.prototype.apply;
 Game_Action.prototype.apply=function(target){
  const before=target.hp;
  const statesBefore=new Set(target.states().map(state=>state.id));
  apply.call(this,target);
  const subject=this.subject(),item=this.item();
  if(item&&target.result().isHit()){
   if(item.id===107){
    if(target.isStateAffected(32))target.removeState(32);
    if(target.isStateAffected(31))target._aqwEffectPower={...(target._aqwEffectPower||{}),31:subject.mat};
   }
   if(item.id===108&&!target.isStateAffected(31))target.addState(32);
   if(item.id===208&&target.isStateAffected(33))target._aqwEffectPower={...(target._aqwEffectPower||{}),33:subject.atk};
   if(item.id===52&&target.isStateAffected(40))target._aqwEffectPower={...(target._aqwEffectPower||{}),40:subject.mat};
   if(item.id===61)target._aqwEnergyFlowCaster=subject;
   if(item.id===172){subject.addState(42);target.addState(34);}
   if(item.id===216)subject.addState(43);
   if(item.id===218){subject.addState(44);target.addState(52);}
   if(item.id===226){
    target.addState(41);
    target._aqwDeathMarkStacks=Math.min(6,(target._aqwDeathMarkStacks||0)+1);

   }
   if(item.id===227){
    const marks=Math.min(6,subject._aqwMarkStacks||0);
    target.addState(57);
    target._aqwEffectPower={...(target._aqwEffectPower||{}),57:subject.atk*0.10*(1+marks*0.05)};
   }

   if(item.id===232){
    const marks=Math.min(6,subject._aqwMarkStacks||0);
    subject.addState(60);
    subject._aqwEffectPower={...(subject._aqwEffectPower||{}),60:subject.atk*0.10*(1+marks*0.05)};
   }
   if(item.id===236){
    subject.addState(66);
    subject._aqwCutlassStacks=Math.min(5,(subject._aqwCutlassStacks||0)+1);
   }
   if(item.id===238){
    if(Math.random()<0.5){target.addState(70);target._aqwEffectPower={...(target._aqwEffectPower||{}),70:subject.atk};}
    else target.addState(71);
   }
   if(item.id===241)target.addState(72);
  }
  if(target.isStateAffected(39)&&target.hp<before){
   const caster=target._aqwEnergyFlowCaster;
   if(caster&&caster.isAlive())caster.gainMp(Math.max(1,Math.floor((before-target.hp)*0.1)));
  }
  if(item&&item.id===201){
   subject._aqwPreparedDouble=subject.isStateAffected(36);
   subject.addState(37);
  }
  if(subject.isStateAffected(37)&&this.isAttack()){
   subject._aqwPreparedHits=(subject._aqwPreparedHits||0)+1;
   if(subject._aqwPreparedHits>=2){subject.removeState(37);subject._aqwPreparedHits=0;subject._aqwPreparedDouble=false;}
  }
  const addedStates=target.result().addedStates||[];
  for(const state of target.states()){
   if(/<AQWDoT:/i.test(state.note)&&(addedStates.includes(state.id)||!statesBefore.has(state.id))){
    target._aqwDotCasters=target._aqwDotCasters||{};
    target._aqwDotCasters[state.id]=subject;
   }
  }
 };
 const applyGlobal=Game_Action.prototype.applyGlobal;
 Game_Action.prototype.applyGlobal=function(){
  applyGlobal.call(this);
  const item=this.item(),subject=this.subject();
  if(item&&item.id===226){
   subject.addState(62);
   subject._aqwMarkStacks=Math.min(6,(subject._aqwMarkStacks||0)+1);
  }
  if(item&&item.id===229){
   subject.removeState(62);
   subject._aqwMarkStacks=0;
  }
  if(item&&item.id===237){
   for(const id of [67,68,69])subject.removeState(id);
   const pick=[67,68,69][Math.floor(Math.random()*3)];
   subject.addState(pick);
   if(pick===67)subject._aqwEffectPower={...(subject._aqwEffectPower||{}),67:subject.atk};
  }
 };
 const actionSpeed=Game_Action.prototype.speed;
 Game_Action.prototype.speed=function(){
  const value=actionSpeed.call(this);
  const subject=this.subject();
  const haste=(subject&&subject.isStateAffected(58)?0.07:0)+(subject&&subject.isStateAffected(63)?0.06:0);
  return haste>0?value+Math.max(1,Math.floor(subject.agi*haste)):value;
 };
 const cost=Game_BattlerBase.prototype.skillMpCost;
 Game_BattlerBase.prototype.skillMpCost=function(skill){
  let value=cost.call(this,skill);
  if(this.isStateAffected(49))return 0;
  if(this.isStateAffected(51))value*=0.5;
  return Math.floor(value);
 };
 const passiveMap={
  2:[[200,45],[202,46]],
  3:[[209,47],[211,48]],
  4:[[187,56],[234,61]],
  5:[[233,55],[202,46]],
  8:[[230,58],[231,59]],
  15:[[239,63],[240,64],[242,65]]
 };
 const refreshPassives=function(){
  if(!this.isActor())return;
  const id=this._aqwActiveClassId||this._classId;
  const entries=passiveMap[id]||[];
  for(const pair of Object.values(passiveMap)){for(const entry of pair)this.removeState(entry[1]);}
  for(const [skillId,stateId] of entries){if(this.isLearnedSkill(skillId))this.addState(stateId);}
 };
 const refreshLearnings=Game_Actor.prototype.refreshAqwClassSkills;
 if(refreshLearnings){
  Game_Actor.prototype.refreshAqwClassSkills=function(classId){
   refreshLearnings.call(this,classId);
   refreshPassives.call(this);
  };
 }
})();
