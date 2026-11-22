/*:
 * @target MZ
 * @plugindesc AQW class identity and independent class progression.
 * @author AQW-MZ
 *
 * @help
 * Class equipment belongs in equip slot 2 (Armor) and is named
 * "Class Name, Rank 1". The name resolves against the Classes database.
 *
 * Progress is stored on the actor save data by class ID:
 *   actor.classProgress(classId) -> { xp, rank }
 *   actor.gainClassExp(classId, amount)
 *   actor.setClassRank(classId, rank)
 *   actor.classRank(classId)
 *
 * Class XP follows AQW's rank thresholds and automatically awards ranks.
 * Class learnings are granted when learning.level <= that class's rank.
 * Learned skills are never removed when changing classes.
 */
(() => {
    "use strict";

    // AQW class-point totals required to reach each rank (1 through 10).
    const CLASS_RANK_TOTALS = [0, 900, 3600, 10000, 22500, 44100, 78400, 129600, 202500, 302500];

    function rankForClassExp(xp) {
        let rank = 1;
        for (let i = 1; i < CLASS_RANK_TOTALS.length; i++) {
            if (xp >= CLASS_RANK_TOTALS[i]) rank = i + 1;
            else break;
        }
        return rank;
    }

    const _Game_Actor_initMembers = Game_Actor.prototype.initMembers;
    Game_Actor.prototype.initMembers = function() {
        _Game_Actor_initMembers.call(this);
        this._aqwClassProgress = this._aqwClassProgress || {};
        this._aqwActiveClassId = 0;
    };

    Game_Actor.prototype.classProgress = function(classId) {
        this._aqwClassProgress = this._aqwClassProgress || {};
        const key = String(Number(classId));
        if (!this._aqwClassProgress[key]) {
            this._aqwClassProgress[key] = { xp: 0, rank: 1 };
        }
        return this._aqwClassProgress[key];
    };

    Game_Actor.prototype.classRank = function(classId) {
        const id = classId || this._aqwActiveClassId || this._classId;
        return this.classProgress(id).rank;
    };

    Game_Actor.prototype.classExp = function(classId) {
        const id = classId || this._aqwActiveClassId || this._classId;
        return this.classProgress(id).xp;
    };

    Game_Actor.prototype.gainClassExp = function(classId, amount) {
        const progress = this.classProgress(classId);
        const previousRank = progress.rank;
        progress.xp = Math.min(
            CLASS_RANK_TOTALS[CLASS_RANK_TOTALS.length - 1],
            Math.max(0, progress.xp + Math.floor(Number(amount) || 0))
        );
        progress.rank = rankForClassExp(progress.xp);
        if (progress.rank > previousRank) this.refreshAqwClassSkills(classId);
        return progress.xp;
    };

    Game_Actor.prototype.classExpForCurrentRank = function(classId) {
        const id = classId || this._aqwActiveClassId || this._classId;
        const progress = this.classProgress(id);
        const rank = rankForClassExp(progress.xp);
        const maxXp = CLASS_RANK_TOTALS[CLASS_RANK_TOTALS.length - 1];
        if (rank >= 10) {
            return { current: maxXp, required: maxXp, total: progress.xp, rank: rank };
        }
        const floor = CLASS_RANK_TOTALS[rank - 1];
        const ceiling = CLASS_RANK_TOTALS[rank];
        return {
            current: progress.xp - floor,
            required: ceiling - floor,
            total: progress.xp,
            rank: rank
        };
    };

    Game_Actor.prototype.setClassRank = function(classId, rank) {
        const progress = this.classProgress(classId);
        progress.rank = Math.max(1, Math.floor(Number(rank) || 1));
        this.refreshAqwClassSkills(classId);
        return progress.rank;
    };

    Game_Actor.prototype.refreshAqwClassSkills = function(classId) {
        const id = Number(classId || this._aqwActiveClassId || this._classId);
        const classData = $dataClasses[id];
        if (!classData) return;
        const rank = this.classRank(id);
        for (const learning of classData.learnings || []) {
            if (learning && learning.skillId > 0 && learning.level <= rank) {
                this.learnSkill(learning.skillId);
            }
        }
    };

    function classNameFromItem(item) {
        if (!item || !item.name) return "";
        const match = item.name.match(/^(.+?)(?:\s+Class)?,?\s*Rank\s*\d+$/i);
        return match ? match[1].trim() : "";
    }

    function classIdByName(name) {
        const wanted = String(name || "").trim().toLowerCase();
        if (!wanted) return 0;
        const data = $dataClasses.find(entry =>
            entry && entry.name && entry.name.trim().toLowerCase() === wanted
        );
        return data ? data.id : 0;
    }

    Game_Actor.prototype.equipAqwClassFromItem = function(item) {
        const name = classNameFromItem(item);
        if (!name) return false;
        const classId = classIdByName(name);
        if (!classId) {
            console.warn("[AQW Class System] No Classes database entry named:", name);
            return false;
        }
        this._aqwActiveClassId = classId;
        this._classId = classId;
        this.refresh();
        this.refreshAqwClassSkills(classId);
        return true;
    };

    const _Game_Actor_changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function(slotId, item) {
        _Game_Actor_changeEquip.call(this, slotId, item);
        if (this.equipSlots()[slotId] === 2) {
            this.equipAqwClassFromItem(this.equips()[slotId]);
        }
    };

    const _Game_Actor_forceChangeEquip = Game_Actor.prototype.forceChangeEquip;
    Game_Actor.prototype.forceChangeEquip = function(slotId, item) {
        _Game_Actor_forceChangeEquip.call(this, slotId, item);
        if (this.equipSlots()[slotId] === 2) {
            this.equipAqwClassFromItem(this.equips()[slotId]);
        }
    };

    const _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        this._aqwClassProgress = this._aqwClassProgress || {};
        this._aqwActiveClassId = this._classId;
        this.refreshAqwClassSkills(this._classId);
    };
})();
