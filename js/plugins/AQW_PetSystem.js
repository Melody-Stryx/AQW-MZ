/*:
 * @target MZ
 * @plugindesc AQW single-player party and autonomous, untargetable pets.
 * @author AQW-MZ
 *
 * @help
 * Mark a pet actor with <AQWPet> in the actor's Note field.
 * Mark a pet equipment item with <PetActor: ACTOR_ID> in its Note field.
 * Equipping that item in the Pet slot adds the pet actor to battle.
 *
 * Pet actors are auto-battle controlled, hidden from non-battle party
 * menus, and excluded from skill target lists (single and area targets).
 * The player actor remains the only manually controlled actor.
 */
(() => {
    "use strict";

    Game_Actor.prototype.isAqwPet = function() {
        return !!(this.actor() && /<AQWPet>/i.test(this.actor().note || ""));
    };

    const _Game_Actor_isAutoBattle = Game_BattlerBase.prototype.isAutoBattle;
    Game_BattlerBase.prototype.isAutoBattle = function() {
        return (this.isActor && this.isActor() && this.isAqwPet && this.isAqwPet())
            || _Game_Actor_isAutoBattle.call(this);
    };

    function petActorId(item) {
        if (!item) return 0;
        const match = String(item.note || "").match(/<PetActor:\s*(\d+)\s*>/i);
        return match ? Number(match[1]) : 0;
    }

    function equippedPetIds(actor) {
        return actor.equips().map(petActorId).filter(id => id > 0);
    }

    function syncPets(actor) {
        if (!actor || actor !== $gameParty.leader()) return;
        const wanted = new Set(equippedPetIds(actor));
        for (const member of $gameParty.allMembers().slice()) {
            if (member.isAqwPet && member.isAqwPet() && !wanted.has(member.actorId())) {
                $gameParty.removeActor(member.actorId());
            }
        }
        for (const id of wanted) {
            const pet = $gameActors.actor(id);
            if (pet && pet.isAqwPet() && !$gameParty.allMembers().includes(pet)) {
                $gameParty.addActor(id);
            }
        }
    }

    const _Game_Actor_changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function(slotId, item) {
        _Game_Actor_changeEquip.call(this, slotId, item);
        if (this === $gameParty.leader()) syncPets(this);
    };

    const _Game_Actor_forceChangeEquip = Game_Actor.prototype.forceChangeEquip;
    Game_Actor.prototype.forceChangeEquip = function(slotId, item) {
        _Game_Actor_forceChangeEquip.call(this, slotId, item);
        if (this === $gameParty.leader()) syncPets(this);
    };

    const _Game_Party_members = Game_Party.prototype.members;
    Game_Party.prototype.members = function() {
        const members = _Game_Party_members.call(this);
        return this.inBattle() ? members : members.filter(actor => !actor.isAqwPet || !actor.isAqwPet());
    };

    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        const targets = _Game_Action_makeTargets.call(this);
        return targets.filter(target => !target.isAqwPet || !target.isAqwPet());
    };

    const _Game_Party_setupStartingMembers = Game_Party.prototype.setupStartingMembers;
    Game_Party.prototype.setupStartingMembers = function() {
        _Game_Party_setupStartingMembers.call(this);
        syncPets(this.leader());
    };

    const PLAYER_ACTOR_ID = 1;
    const _Game_Party_addActor = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function(actorId) {
        const actor = $gameActors.actor(actorId);
        if (actor && actor.isAqwPet && actor.isAqwPet()) {
            if (!this._actors.includes(actorId)) this._actors.push(actorId);
            return;
        }
        if (actorId !== PLAYER_ACTOR_ID) return;
        _Game_Party_addActor.call(this, actorId);
    };

    Game_Party.prototype.maxBattleMembers = function() {
        return this._actors.length;
    };
})();
