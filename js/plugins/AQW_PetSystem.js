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

    function syncPets(actor, includePets = $gameParty.inBattle()) {
        // The player is the only party leader. Do not depend on $gameParty.members()
        // here because that list intentionally hides pets outside battle.
        if (!actor || actor.actorId() !== PLAYER_ACTOR_ID) return;

        const wanted = includePets ? new Set(equippedPetIds(actor)) : new Set();
        const currentPetIds = ($gameParty._actors || []).filter(id => {
            const member = $gameActors.actor(id);
            return member && member.isAqwPet && member.isAqwPet();
        });

        for (const id of currentPetIds) {
            if (!wanted.has(id)) {
                _Game_Party_removeActor.call($gameParty, id);
            }
        }

        for (const id of wanted) {
            const pet = $gameActors.actor(id);
            if (pet && pet.isAqwPet() && !$gameParty._actors.includes(id)) {
                _Game_Party_addActor.call($gameParty, id);
            }
        }

        // Refresh party/map state after roster changes.
        if ($gamePlayer) $gamePlayer.refresh();
        if ($gameMap) $gameMap.requestRefresh();
    }

    const PLAYER_ACTOR_ID = 1;
    const _Game_Party_addActor = Game_Party.prototype.addActor;
    const _Game_Party_removeActor = Game_Party.prototype.removeActor;

    const _Game_Actor_changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function(slotId, item) {
        _Game_Actor_changeEquip.call(this, slotId, item);
        if (this.actorId() === PLAYER_ACTOR_ID) syncPets(this);
    };

    const _Game_Actor_forceChangeEquip = Game_Actor.prototype.forceChangeEquip;
    Game_Actor.prototype.forceChangeEquip = function(slotId, item) {
        _Game_Actor_forceChangeEquip.call(this, slotId, item);
        if (this.actorId() === PLAYER_ACTOR_ID) syncPets(this);
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

    // Event commands and plugins may equip items through different methods.
    // Reconcile after an equipment-by-ID operation as well.
    const _Game_Actor_changeEquipById = Game_Actor.prototype.changeEquipById;
    Game_Actor.prototype.changeEquipById = function(etypeId, itemId) {
        _Game_Actor_changeEquipById.call(this, etypeId, itemId);
        if (this.actorId() === PLAYER_ACTOR_ID) syncPets(this);
    };

    const _Game_Party_setupStartingMembers = Game_Party.prototype.setupStartingMembers;
    Game_Party.prototype.setupStartingMembers = function() {
        _Game_Party_setupStartingMembers.call(this);
        syncPets(this.leader());
    };

    Game_Party.prototype.addActor = function(actorId) {
        const actor = $gameActors.actor(actorId);
        if (actorId !== PLAYER_ACTOR_ID && !(actor && actor.isAqwPet && actor.isAqwPet())) {
            return;
        }
        _Game_Party_addActor.call(this, actorId);
    };

    Game_Party.prototype.maxBattleMembers = function() {
        return this._actors.length;
    };

    // Remove pets after battle so the exploration party stays clean.
    const _Game_Party_onBattleEnd = Game_Party.prototype.onBattleEnd;
    Game_Party.prototype.onBattleEnd = function() {
        _Game_Party_onBattleEnd.call(this);
        syncPets($gameActors.actor(PLAYER_ACTOR_ID), false);
    };

    // Add equipped summons before RPG Maker initializes the battle roster.
    const _BattleManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        syncPets($gameActors.actor(PLAYER_ACTOR_ID), true);
        _BattleManager_setup.call(this, troopId, canEscape, canLose);
    };
})();
