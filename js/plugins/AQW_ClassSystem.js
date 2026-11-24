/*:
 * @target MZ
 * @plugindesc AQW class equipment, class-specific ranks, XP, and class skills.
 * @author AQW-MZ
 *
 * @help
 * Weapon equipment occupies slot 1 and cannot be empty.
 * Class equipment occupies equipment slot 2 (the Armor slot).
 * Class items use <AQWClassId: ID>. <ClassChange: ID> is also supported.
 * Existing item names such as "Warrior, Rank 1" are supported as a fallback.
 *
 * If an actor starts without class equipment, the matching class armor is
 * equipped automatically. The weapon and class slots cannot be cleared.
 * The class slot also cannot be replaced by a non-class item.
 *
 * Class XP and rank are stored independently for every class:
 *   actor.classProgress(classId) -> { xp, rank }
 *   actor.gainClassExp(classId, amount)
 *   actor.setClassRank(classId, rank)
 *   actor.classRank(classId)
 *   actor.classExp(classId)
 *
 * Class learnings are unlocked by class rank, not the actor's RPG level.
 * Class skills are removed when changing class unless they were also learned
 * independently. Skills learned through events or other systems are retained.
 *
 * Class switching does not reset the actor's normal level or normal EXP.
 *
 * This plugin integrates with AQW_PetSystem and AQW_BattleEffects. Keep it
 * above those plugins in the Plugin Manager.
 */
(() => {
    "use strict";

    const CLASS_SLOT_ID = 1;
    const CLASS_EQUIP_TYPE_ID = 2;
    const CLASS_RANK_TOTALS = [
        0, 900, 3600, 10000, 22500,
        44100, 78400, 129600, 202500, 302500
    ];
    const MAX_CLASS_RANK = CLASS_RANK_TOTALS.length;

    function rankForClassExp(xp) {
        let rank = 1;
        for (let i = 1; i < CLASS_RANK_TOTALS.length; i++) {
            if (xp >= CLASS_RANK_TOTALS[i]) rank = i + 1;
            else break;
        }
        return rank;
    }

    function noteNumber(item, tag) {
        if (!item || !item.note) return 0;
        const expression = new RegExp("<" + tag + ":\\s*(\\d+)\\s*>", "i");
        const match = item.note.match(expression);
        return match ? Number(match[1]) : 0;
    }

    function classNameFromItem(item) {
        if (!item || !item.name) return "";
        const match = item.name.match(/^(.+?)(?:\\s+Class)?,?\\s*Rank\\s*\\d+$/i);
        return match ? match[1].trim() : "";
    }

    function classIdFromItem(item) {
        if (!item || !DataManager.isArmor(item) || item.etypeId !== CLASS_EQUIP_TYPE_ID) {
            return 0;
        }
        const taggedId = noteNumber(item, "AQWClassId") || noteNumber(item, "ClassChange");
        if (taggedId && $dataClasses[taggedId]) return taggedId;

        const wanted = classNameFromItem(item).toLowerCase();
        if (!wanted) return 0;
        const classData = $dataClasses.find(entry =>
            entry && entry.name && entry.name.trim().toLowerCase() === wanted
        );
        return classData ? classData.id : 0;
    }

    function defaultClassArmor(classId) {
        if (!classId || !$dataArmors) return null;
        return $dataArmors.find(item =>
            item && item.etypeId === CLASS_EQUIP_TYPE_ID &&
            classIdFromItem(item) === Number(classId)
        ) || null;
    }

    function defaultWeapon(actor) {
        const startingWeaponId = actor.actor().equips[0];
        const startingWeapon = startingWeaponId > 0
            ? $dataWeapons[startingWeaponId]
            : null;
        if (startingWeapon && actor.canEquip(startingWeapon)) return startingWeapon;
        return ($dataWeapons || []).find(item =>
            item && actor.canEquip(item)
        ) || null;
    }

    function isWeaponSlot(actor, slotId) {
        return slotId === 0 && actor.equipSlots()[0] === 1;
    }

    function uniquePush(array, value) {
        if (!array.includes(value)) array.push(value);
    }

    const _Game_Actor_initMembers = Game_Actor.prototype.initMembers;
    Game_Actor.prototype.initMembers = function() {
        _Game_Actor_initMembers.call(this);
        this._aqwClassProgress = {};
        this._aqwActiveClassId = 0;
        this._aqwClassSkillIds = [];
        this._aqwIndependentSkillIds = [];
        this._aqwSkillSourcesInitialized = true;
    };

    Game_Actor.prototype.classProgress = function(classId) {
        this._aqwClassProgress = this._aqwClassProgress || {};
        const id = Number(classId || this._aqwActiveClassId || this._classId);
        const key = String(id);
        let progress = this._aqwClassProgress[key];
        if (!progress || typeof progress !== "object") {
            progress = { xp: 0, rank: 1 };
            this._aqwClassProgress[key] = progress;
        }
        progress.xp = Math.max(0, Math.floor(Number(progress.xp) || 0));
        progress.rank = Math.max(
            1,
            Math.min(MAX_CLASS_RANK, Math.floor(Number(progress.rank) || rankForClassExp(progress.xp)))
        );
        return progress;
    };

    Game_Actor.prototype.classRank = function(classId) {
        const id = Number(classId || this._aqwActiveClassId || this._classId);
        return this.classProgress(id).rank;
    };

    Game_Actor.prototype.classExp = function(classId) {
        const id = Number(classId || this._aqwActiveClassId || this._classId);
        return this.classProgress(id).xp;
    };

    Game_Actor.prototype.gainClassExp = function(classId, amount) {
        const id = Number(classId || this._aqwActiveClassId || this._classId);
        const progress = this.classProgress(id);
        const previousRank = progress.rank;
        progress.xp = Math.min(
            CLASS_RANK_TOTALS[CLASS_RANK_TOTALS.length - 1],
            Math.max(0, progress.xp + Math.floor(Number(amount) || 0))
        );
        progress.rank = rankForClassExp(progress.xp);
        if (progress.rank > previousRank && id === this._aqwActiveClassId) {
            this.refreshAqwClassSkills(id);
        }
        return progress.xp;
    };

    Game_Actor.prototype.classExpForCurrentRank = function(classId) {
        const id = Number(classId || this._aqwActiveClassId || this._classId);
        const progress = this.classProgress(id);
        const rank = progress.rank;
        const maxXp = CLASS_RANK_TOTALS[CLASS_RANK_TOTALS.length - 1];
        if (rank >= MAX_CLASS_RANK) {
            return { current: maxXp, required: maxXp, total: progress.xp, rank: rank };
        }
        const floor = CLASS_RANK_TOTALS[rank - 1];
        const ceiling = CLASS_RANK_TOTALS[rank];
        return {
            current: Math.max(0, progress.xp - floor),
            required: ceiling - floor,
            total: progress.xp,
            rank: rank
        };
    };

    Game_Actor.prototype.setClassRank = function(classId, rank) {
        const id = Number(classId || this._aqwActiveClassId || this._classId);
        const progress = this.classProgress(id);
        progress.rank = Math.max(1, Math.min(MAX_CLASS_RANK, Math.floor(Number(rank) || 1)));
        progress.xp = CLASS_RANK_TOTALS[progress.rank - 1];
        if (id === this._aqwActiveClassId) this.refreshAqwClassSkills(id);
        return progress.rank;
    };

    Game_Actor.prototype.ensureAqwSkillTracking = function() {
        if (this._aqwSkillSourcesInitialized &&
            Array.isArray(this._aqwClassSkillIds) &&
            Array.isArray(this._aqwIndependentSkillIds)) {
            return;
        }

        this._aqwClassSkillIds = [];
        this._aqwIndependentSkillIds = [];
        const knownClassSkills = new Set();
        for (const classData of $dataClasses || []) {
            if (!classData) continue;
            for (const learning of classData.learnings || []) {
                if (learning && learning.skillId > 0) knownClassSkills.add(learning.skillId);
            }
        }

        for (const skillId of this._skills || []) {
            if (knownClassSkills.has(skillId)) {
                uniquePush(this._aqwClassSkillIds, skillId);
            } else {
                uniquePush(this._aqwIndependentSkillIds, skillId);
            }
        }
        this._aqwSkillSourcesInitialized = true;
    };

    const _Game_Actor_learnSkill = Game_Actor.prototype.learnSkill;
    Game_Actor.prototype.learnSkill = function(skillId) {
        this.ensureAqwSkillTracking();
        if (this._aqwIgnoreEngineClassLearning) return;
        _Game_Actor_learnSkill.call(this, skillId);

        if (this._aqwClassSkillContext) {
            uniquePush(this._aqwClassSkillIds, skillId);
        } else {
            // Record independent ownership even if the active class already
            // grants this skill. It must survive a later class switch.
            uniquePush(this._aqwIndependentSkillIds, skillId);
        }
    };

    const _Game_Actor_forgetSkill = Game_Actor.prototype.forgetSkill;
    Game_Actor.prototype.forgetSkill = function(skillId) {
        this.ensureAqwSkillTracking();
        _Game_Actor_forgetSkill.call(this, skillId);
        this._aqwClassSkillIds = this._aqwClassSkillIds.filter(id => id !== skillId);
        this._aqwIndependentSkillIds = this._aqwIndependentSkillIds.filter(id => id !== skillId);
    };

    // MZ normally grants class learnings from actor level. AQW class skills
    // are instead controlled exclusively by the class's independent rank.
    Game_Actor.prototype.initSkills = function() {
        this._skills = [];
        this._aqwClassSkillIds = [];
        this._aqwIndependentSkillIds = [];
        this._aqwSkillSourcesInitialized = true;
        this.refreshAqwClassSkills(this._aqwActiveClassId || this._classId);
    };

    const _Game_Actor_levelUp = Game_Actor.prototype.levelUp;
    Game_Actor.prototype.levelUp = function() {
        this._aqwIgnoreEngineClassLearning = true;
        try {
            _Game_Actor_levelUp.call(this);
        } finally {
            this._aqwIgnoreEngineClassLearning = false;
        }
    };

    Game_Actor.prototype.refreshAqwClassSkills = function(classId) {
        this.ensureAqwSkillTracking();
        const id = Number(classId || this._aqwActiveClassId || this._classId);
        if (!id || id !== Number(this._aqwActiveClassId || this._classId)) return;

        const classData = $dataClasses[id];
        if (!classData) return;

        const rank = this.classRank(id);
        const wanted = new Set(
            (classData.learnings || [])
                .filter(learning => learning && learning.skillId > 0 && learning.level <= rank)
                .map(learning => learning.skillId)
        );

        for (const skillId of this._aqwClassSkillIds.slice()) {
            if (!wanted.has(skillId)) {
                if (!this._aqwIndependentSkillIds.includes(skillId)) {
                    _Game_Actor_forgetSkill.call(this, skillId);
                }
                this._aqwClassSkillIds = this._aqwClassSkillIds.filter(id2 => id2 !== skillId);
            }
        }

        this._aqwClassSkillContext = true;
        try {
            for (const skillId of wanted) {
                _Game_Actor_learnSkill.call(this, skillId);
                uniquePush(this._aqwClassSkillIds, skillId);
            }
        } finally {
            this._aqwClassSkillContext = false;
        }
    };

    Game_Actor.prototype.syncAqwClassFromEquipment = function() {
        const slots = this.equipSlots();
        if (slots[CLASS_SLOT_ID] !== CLASS_EQUIP_TYPE_ID) return false;

        let item = this.equips()[CLASS_SLOT_ID];
        let classId = classIdFromItem(item);

        if (!classId) {
            item = defaultClassArmor(this._aqwActiveClassId || this._classId);
            if (item && this._equips[CLASS_SLOT_ID]) {
                this._equips[CLASS_SLOT_ID].setObject(item);
                classId = classIdFromItem(item);
            }
        }
        if (!classId) {
            console.error(
                "[AQW Class System] No valid class armor is equipped or available for actor:",
                this.actorId()
            );
            return false;
        }

        const previousClassId = Number(this._aqwActiveClassId || this._classId);
        this.ensureAqwSkillTracking();

        if (previousClassId !== classId) {
            for (const skillId of this._aqwClassSkillIds.slice()) {
                if (!this._aqwIndependentSkillIds.includes(skillId)) {
                    _Game_Actor_forgetSkill.call(this, skillId);
                }
            }
            this._aqwClassSkillIds = [];
            this._aqwActiveClassId = classId;
            this._classId = classId;
        } else {
            this._aqwActiveClassId = classId;
            this._classId = classId;
        }

        this.refreshAqwClassSkills(classId);
        this.refresh();
        return true;
    };

    const _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        this._aqwClassProgress = this._aqwClassProgress || {};
        this._aqwActiveClassId = this._classId;
        this.ensureAqwSkillTracking();
        this.syncAqwClassFromEquipment();
    };

    function isClassSlot(actor, slotId) {
        return slotId === CLASS_SLOT_ID &&
            actor.equipSlots()[CLASS_SLOT_ID] === CLASS_EQUIP_TYPE_ID;
    }

    const _Game_Actor_changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function(slotId, item) {
        if (isWeaponSlot(this, slotId) && !DataManager.isWeapon(item)) return;
        if (isClassSlot(this, slotId) && !classIdFromItem(item)) return;
        _Game_Actor_changeEquip.call(this, slotId, item);
        if (isClassSlot(this, slotId)) this.syncAqwClassFromEquipment();
    };

    const _Game_Actor_forceChangeEquip = Game_Actor.prototype.forceChangeEquip;
    Game_Actor.prototype.forceChangeEquip = function(slotId, item) {
        if (isWeaponSlot(this, slotId) && !DataManager.isWeapon(item)) return;
        if (isClassSlot(this, slotId) && !classIdFromItem(item)) return;
        _Game_Actor_forceChangeEquip.call(this, slotId, item);
        if (isClassSlot(this, slotId)) this.syncAqwClassFromEquipment();
    };

    // MZ can clear equipment during validation. Restore the previous weapon
    // and class item if another system attempts to leave either slot empty.
    const _Game_Actor_releaseUnequippableItems = Game_Actor.prototype.releaseUnequippableItems;
    Game_Actor.prototype.releaseUnequippableItems = function(forcing) {
        const previousWeapon = isWeaponSlot(this, 0) ? this.equips()[0] : null;
        const previousClassItem = isClassSlot(this, CLASS_SLOT_ID)
            ? this.equips()[CLASS_SLOT_ID]
            : null;
        _Game_Actor_releaseUnequippableItems.call(this, forcing);

        if (isWeaponSlot(this, 0) && !this.equips()[0]) {
            const restoreWeapon = DataManager.isWeapon(previousWeapon)
                ? previousWeapon
                : defaultWeapon(this);
            if (restoreWeapon && this._equips[0]) {
                this._equips[0].setObject(restoreWeapon);
            }
        }

        if (isClassSlot(this, CLASS_SLOT_ID) && !this.equips()[CLASS_SLOT_ID]) {
            const restore = classIdFromItem(previousClassItem)
                ? previousClassItem
                : defaultClassArmor(this._aqwActiveClassId || this._classId);
            if (restore && this._equips[CLASS_SLOT_ID]) {
                this._equips[CLASS_SLOT_ID].setObject(restore);
            }
        }
    };
})();
