/*:
 * @target MZ
 * @plugindesc AQW battle pets: equipment-driven summons with autonomous battle sprites.
 * @author AQW-MZ
 *
 * @help
 * Actor note: <AQWPet>
 * Equipment note: <PetActor: ACTOR_ID>
 *
 * Equipping an item with <PetActor: ID> on the player summons that pet in
 * battle. Pets are auto-battle controlled, hidden outside battle, and cannot
 * be selected as targets. Pet actors use their normal actor database setup
 * and may use Walk Character Battlers for their battle graphics.
 */
(() => {
    "use strict";

    const PLAYER_ACTOR_ID = 1;

    function isPetActor(actor) {
        return !!(actor && actor.isActor && actor.isActor() &&
            actor.actor && /<AQWPet>/i.test(actor.actor().note || ""));
    }

    function petIdFromEquip(item) {
        if (!item) return 0;
        const match = String(item.note || "").match(/<PetActor:\s*(\d+)\s*>/i);
        return match ? Number(match[1]) : 0;
    }

    function equippedPetIds(player) {
        if (!player) return [];
        const ids = player.equips().map(petIdFromEquip).filter(id => id > 0);
        return [...new Set(ids)].filter(id => isPetActor($gameActors.actor(id)));
    }

    function activeBattleScene() {
        return !!(SceneManager._scene && SceneManager._scene instanceof Scene_Battle);
    }

    function shouldPetsBeActive() {
        return !!($gameParty && ($gameParty.inBattle() || activeBattleScene()));
    }

    function reconcilePartyPets(includePets = shouldPetsBeActive()) {
        if (!$gameParty || !$gameActors) return false;
        const player = $gameActors.actor(PLAYER_ACTOR_ID);
        if (!player) return false;

        const wanted = includePets ? equippedPetIds(player) : [];
        const actorIds = $gameParty._actors || [];
        const existingPets = actorIds.filter(id => isPetActor($gameActors.actor(id)));
        let changed = false;

        for (const id of existingPets) {
            if (!wanted.includes(id)) {
                $gameParty._actors.splice($gameParty._actors.indexOf(id), 1);
                changed = true;
            }
        }

        for (const id of wanted) {
            if (!$gameParty._actors.includes(id)) {
                $gameParty._actors.push(id);
                changed = true;
            }
        }

        if (changed) {
            if ($gamePlayer) $gamePlayer.refresh();
            if ($gameMap) $gameMap.requestRefresh();
            refreshBattleActorSprites();
        }
        return changed;
    }

    function refreshBattleActorSprites() {
        const scene = SceneManager._scene;
        const spriteset = scene && scene._spriteset;
        if (!(scene instanceof Scene_Battle) || !spriteset || !spriteset._battleField) return;

        // Reconcile rather than recreating the whole layer. RPG Maker's own
        // updateActors method continues to assign the current battle members.
        spriteset.updateActors();

        for (const sprite of spriteset._actorSprites || []) {
            if (!sprite._battler) continue;
            sprite.updateBitmap();
            sprite.updateFrame();
        }
    }

    const _Game_BattlerBase_isAutoBattle = Game_BattlerBase.prototype.isAutoBattle;
    Game_BattlerBase.prototype.isAutoBattle = function() {
        return (this.isActor && this.isActor() && isPetActor(this))
            || _Game_BattlerBase_isAutoBattle.call(this);
    };

    const _Game_Party_members = Game_Party.prototype.members;
    Game_Party.prototype.members = function() {
        const members = _Game_Party_members.call(this);
        return shouldPetsBeActive() ? members : members.filter(member => !isPetActor(member));
    };

    const _Game_Party_maxBattleMembers = Game_Party.prototype.maxBattleMembers;
    Game_Party.prototype.maxBattleMembers = function() {
        return shouldPetsBeActive()
            ? Math.max(_Game_Party_maxBattleMembers.call(this), this._actors.length)
            : _Game_Party_maxBattleMembers.call(this);
    };

    const _Game_Party_addActor = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function(actorId) {
        const actor = $gameActors.actor(actorId);
        if (actorId !== PLAYER_ACTOR_ID && !isPetActor(actor)) return;
        _Game_Party_addActor.call(this, actorId);
        refreshBattleActorSprites();
    };

    const _Game_Party_removeActor = Game_Party.prototype.removeActor;
    Game_Party.prototype.removeActor = function(actorId) {
        _Game_Party_removeActor.call(this, actorId);
        refreshBattleActorSprites();
    };

    // RPG Maker creates actor sprites once at battle setup. Keep that layer
    // synchronized as pets are summoned or dismissed during an active battle.
    const _Spriteset_Battle_updateActors = Spriteset_Battle.prototype.updateActors;
    Spriteset_Battle.prototype.updateActors = function() {
        const members = $gameParty.battleMembers();
        this._actorSprites = this._actorSprites || [];

        while (this._actorSprites.length > members.length) {
            const sprite = this._actorSprites.pop();
            if (sprite.parent) sprite.parent.removeChild(sprite);
            sprite.destroy({ children: true });
        }

        while (this._actorSprites.length < members.length) {
            const sprite = new Sprite_Actor();
            this._actorSprites.push(sprite);
            this._battleField.addChild(sprite);
        }

        _Spriteset_Battle_updateActors.call(this);
    };

    // Pets are not valid targets, even for random or all-target actions.
    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        return _Game_Action_makeTargets.call(this).filter(target => !isPetActor(target));
    };

    function syncAfterEquipmentChange(actor) {
        if (actor && actor.actorId() === PLAYER_ACTOR_ID) {
            reconcilePartyPets(shouldPetsBeActive());
        }
    }

    const _Game_Actor_changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function(slotId, item) {
        _Game_Actor_changeEquip.call(this, slotId, item);
        syncAfterEquipmentChange(this);
    };

    const _Game_Actor_forceChangeEquip = Game_Actor.prototype.forceChangeEquip;
    Game_Actor.prototype.forceChangeEquip = function(slotId, item) {
        _Game_Actor_forceChangeEquip.call(this, slotId, item);
        syncAfterEquipmentChange(this);
    };

    const _Game_Actor_changeEquipById = Game_Actor.prototype.changeEquipById;
    Game_Actor.prototype.changeEquipById = function(etypeId, itemId) {
        _Game_Actor_changeEquipById.call(this, etypeId, itemId);
        syncAfterEquipmentChange(this);
    };

    const _BattleManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        reconcilePartyPets(true);
        _BattleManager_setup.call(this, troopId, canEscape, canLose);
    };

    const _Game_Party_onBattleEnd = Game_Party.prototype.onBattleEnd;
    Game_Party.prototype.onBattleEnd = function() {
        _Game_Party_onBattleEnd.call(this);
        reconcilePartyPets(false);
    };

    // Reconcile once the battle scene and its spriteset have been constructed.
    const _Scene_Battle_start = Scene_Battle.prototype.start;
    Scene_Battle.prototype.start = function() {
        reconcilePartyPets(true);
        _Scene_Battle_start.call(this);
        refreshBattleActorSprites();
    };
})();
