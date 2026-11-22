/*:
 * @target MZ
 * @plugindesc AQW-inspired overlay HUD with player status, class rank, Moolah, and level progression.
 * @author AQW-MZ
 *
 * @help
 * Displays player identity and HP/MP at the upper left.
 * Displays class rank progression at the lower left, Moolah at the lower
 * center, and player level progression at the lower right.
 *
 * Class rank meter uses AQW's 10-rank class scale. Class XP is also shown
 * numerically because rank XP thresholds have not yet been defined.
 *
 * Place this plugin after AQW_ClassSystem and AQW_PetSystem.
 */
(() => {
    "use strict";

    const REFRESH_INTERVAL = 12;
    const MAX_CLASS_RANK = 10;
    const EDGE = 16;

    class Window_AqwHud extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this.opacity = 0;
            this.backOpacity = 0;
            this.contentsOpacity = 255;
            this._lastSignature = "";
            this._refreshCounter = 0;
            this.refresh();
        }

        standardPadding() {
            return 0;
        }

        update() {
            super.update();
            this._refreshCounter++;
            if (this._refreshCounter >= REFRESH_INTERVAL) {
                this._refreshCounter = 0;
                const signature = this.makeSignature();
                if (signature !== this._lastSignature) this.refresh();
            }
        }

        playerActor() {
            return $gameActors.actor(1);
        }

        activeClassData(actor) {
            if (!actor) return null;
            const id = actor._aqwActiveClassId || actor.currentClass().id;
            return $dataClasses[id] || actor.currentClass();
        }

        makeSignature() {
            const actor = this.playerActor();
            if (!actor) return "";
            const data = this.activeClassData(actor);
            const id = data ? data.id : 0;
            const rank = id && actor.classRank ? actor.classRank(id) : 1;
            const xp = id && actor.classExp ? actor.classExp(id) : 0;
            return [
                actor.name(), actor.level, actor.hp, actor.mhp, actor.mp, actor.mmp,
                id, data ? data.name : "", rank, xp,
                actor.currentExp(), actor.currentLevelExp(), actor.nextLevelExp(),
                $gameParty.gold()
            ].join("|");
        }

        refresh() {
            if (!this.contents) return;
            this.contents.clear();
            this._lastSignature = this.makeSignature();
            const actor = this.playerActor();
            if (!actor) return;

            this.drawPlayerPanel(actor);
            this.drawClassProgress(actor);
            this.drawMoolah();
            this.drawLevelProgress(actor);
        }

        drawPanel(x, y, width, height, accent) {
            const c = this.contents;
            c.fillRect(x, y, width, height, "rgba(7, 12, 22, 0.82)");
            c.fillRect(x, y, width, 2, accent || "rgba(110, 178, 230, 0.9)");
            c.fillRect(x, y + height - 1, width, 1, "rgba(255,255,255,0.12)");
        }

        drawPlayerPanel(actor) {
            const x = EDGE;
            const y = EDGE;
            const width = Math.min(292, this.contentsWidth() * 0.36);
            const height = 92;
            this.drawPanel(x, y, width, height, "rgba(105, 190, 245, 0.95)");

            const data = this.activeClassData(actor);
            const classId = data ? data.id : 0;
            const className = data ? data.name : "No Class";
            const rank = classId && actor.classRank ? actor.classRank(classId) : 1;

            this.contents.fontSize = 13;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(
                className + " Rank " + String(rank).padStart(2, "0"),
                x + 10, y + 25, width - 20, "left"
            );

            this.drawResourceBar(
                "HP", actor.hp, actor.mhp, x + 10, y + 48, width - 20,
                ColorManager.hpGaugeColor1(), ColorManager.hpGaugeColor2()
            );
            this.drawResourceBar(
                "MP", actor.mp, actor.mmp, x + 10, y + 67, width - 20,
                ColorManager.mpGaugeColor1(), ColorManager.mpGaugeColor2()
            );

            // Match RPG Maker's menu actor-name renderer: hpColor(actor)
            // is the colour used by Window_StatusBase.drawActorName().
            this.contents.fontSize = 19;
            this.changeTextColor(ColorManager.hpColor(actor));
            this.drawText(actor.name(), x + 10, y, width - 20, "left");
            this.resetFontSettings();
        }

        drawResourceBar(label, value, max, x, y, width, color1, color2) {
            const labelWidth = 25;
            const valueWidth = 76;
            const gaugeX = x + labelWidth + 5;
            const gaugeWidth = Math.max(20, width - labelWidth - valueWidth - 10);
            this.contents.fontSize = 13;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(label, x, y - 3, labelWidth, "left");
            this.drawAqwGauge(gaugeX, y + 3, gaugeWidth, max > 0 ? value / max : 0, color1, color2, 7);
            this.contents.fontSize = 12;
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(
                this.formatNumber(value) + "/" + this.formatNumber(max),
                gaugeX + gaugeWidth + 7, y - 3, valueWidth, "right"
            );
        }

        drawClassProgress(actor) {
            const data = this.activeClassData(actor);
            const classId = data ? data.id : 0;
            const name = data ? data.name : "No Class";
            const rank = classId && actor.classRank ? actor.classRank(classId) : 1;
            const progress = classId && actor.classExpForCurrentRank
                ? actor.classExpForCurrentRank(classId)
                : { current: 0, required: 900 };
            const width = Math.min(390, Math.max(250, this.contentsWidth() * 0.31));
            const x = EDGE;
            const gaugeY = this.contentsHeight() - 12;
            const rate = progress.required > 0 ? progress.current / progress.required : 1;

            this.drawAqwGauge(
                x, gaugeY - 4, width, rate,
                "rgba(145, 105, 230, 1)", "rgba(205, 170, 255, 1)", 5
            );
            this.contents.fontSize = 11;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(
                "CLASS XP  " + this.formatNumber(progress.current) + " / " +
                this.formatNumber(progress.required),
                x, gaugeY - 21, width, "left"
            );
            this.resetFontSettings();
        }

        drawMoolah() {
            const iconIndex = 314;
            const value = this.formatNumber($gameParty.gold());
            const textWidth = this.textWidth(value);
            const totalWidth = 32 + 8 + textWidth;
            const x = Math.floor((this.contentsWidth() - totalWidth) / 2);
            const y = this.contentsHeight() - 36;

            this.drawIcon(iconIndex, x, y);
            this.contents.fontSize = 19;
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(value, x + 40, y + 4, textWidth + 4, "left");
            this.resetFontSettings();
        }

        drawLevelProgress(actor) {
            const width = Math.min(300, Math.max(230, this.contentsWidth() * 0.25));
            const x = this.contentsWidth() - width - EDGE;
            const gaugeY = this.contentsHeight() - 12;
            const current = actor.currentExp() - actor.currentLevelExp();
            const required = Math.max(1, actor.nextLevelExp() - actor.currentLevelExp());
            const rate = actor.isMaxLevel() ? 1 : Math.max(0, Math.min(1, current / required));

            this.drawAqwGauge(
                x, gaugeY - 4, width, rate,
                "rgba(65, 175, 130, 1)", "rgba(120, 235, 185, 1)", 5
            );
            this.contents.fontSize = 11;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(
                this.formatNumber(current) + " / " + this.formatNumber(required) + " XP",
                x, gaugeY - 21, width, "right"
            );
            this.resetFontSettings();
        }

        drawAqwGauge(x, y, width, rate, color1, color2, height) {
            const gaugeHeight = height || 8;
            const fillWidth = Math.floor(width * Math.max(0, Math.min(1, rate)));
            this.contents.fillRect(x, y, width, gaugeHeight, "rgba(255,255,255,0.15)");
            if (fillWidth > 0) {
                this.contents.gradientFillRect(x, y, fillWidth, gaugeHeight, color1, color2);
            }
            this.contents.fillRect(x, y, width, 1, "rgba(255,255,255,0.16)");
        }

        formatNumber(value) {
            return Math.floor(Number(value) || 0).toLocaleString("en-US");
        }
    }

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        const rect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
        this._aqwHudWindow = new Window_AqwHud(rect);
        this.addWindow(this._aqwHudWindow);
        // Keep the full-screen HUD behind message and other interactive windows.
        this._windowLayer.setChildIndex(this._aqwHudWindow, 0);
    };
})();