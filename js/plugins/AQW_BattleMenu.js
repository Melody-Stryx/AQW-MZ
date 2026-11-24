/*:
 * @target MZ
 * @plugindesc Streamlines battle commands: skips the party menu, adds Attack to Skills, and places Run last.
 * @author AQW-MZ
 *
 * @help
 * Skips the initial Fight / Run party command menu.
 * The actor command menu opens immediately.
 * Attack is listed inside Skills rather than as a separate command.
 * Run is added as the final actor command.
 */

(() => {
    "use strict";

    // Keep the party command window hidden; the battle input phase still
    // needs to advance past the party-command slot before actor input begins.
    const _Scene_Battle_createPartyCommandWindow =
        Scene_Battle.prototype.createPartyCommandWindow;

    Scene_Battle.prototype.createPartyCommandWindow = function() {
        _Scene_Battle_createPartyCommandWindow.call(this);
        this._partyCommandWindow.hide();
        this._partyCommandWindow.deactivate();
    };

    // Skip the party-command phase correctly by advancing the input sequence.
    Scene_Battle.prototype.startPartyCommandSelection = function() {
        this._partyCommandWindow.hide();
        this._partyCommandWindow.close();
        this._partyCommandWindow.deactivate();
        this.selectNextCommand();
    };

    // Back from the first actor's commands must not return to the party menu.
    Scene_Battle.prototype.selectPreviousCommand = function() {
        this.startActorCommandSelection();
    };

    // Add the Run handler to the actor command window.
    const _Scene_Battle_createActorCommandWindow =
        Scene_Battle.prototype.createActorCommandWindow;

    Scene_Battle.prototype.createActorCommandWindow = function() {
        _Scene_Battle_createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler(
            "escape",
            this.commandEscape.bind(this)
        );
    };

    // Remove Attack from the top-level commands and append Run at the bottom.
    const _Window_ActorCommand_makeCommandList =
        Window_ActorCommand.prototype.makeCommandList;

    Window_ActorCommand.prototype.makeCommandList = function() {
        _Window_ActorCommand_makeCommandList.call(this);
        this._list = this._list.filter(command => command.symbol !== "attack");
        this.addCommand(TextManager.escape, "escape", BattleManager.canEscape());
    };

    // Include the actor's normal Attack skill in the Skills list.
    const _Window_BattleSkill_makeItemList =
        Window_BattleSkill.prototype.makeItemList;

    Window_BattleSkill.prototype.makeItemList = function() {
        _Window_BattleSkill_makeItemList.call(this);
        if (!this._actor) {
            return;
        }

        const attackSkill = $dataSkills[this._actor.attackSkillId()];
        if (attackSkill && !this._data.includes(attackSkill)) {
            this._data.unshift(attackSkill);
        }
    };
})();
