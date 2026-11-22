/*:
 * @target MZ
 * @plugindesc Automatically wraps menu help descriptions at word boundaries.
 * @author AQW-MZ
 *
 * @help
 * Menu-only word wrapping for item, skill, and equipment help descriptions.
 * Preserves manual line breaks and escape codes.
 */
(() => {
    "use strict";

    const _Window_Help_processCharacter =
        Window_Help.prototype.processCharacter || Window_Base.prototype.processCharacter;

    Window_Help.prototype.processCharacter = function(textState) {
        const text = textState.text;
        const index = textState.index;
        const character = text[index];

        if (character && character.charCodeAt(0) >= 0x20 &&
            !/\s/.test(character)) {
            const previous = index > 0 ? text[index - 1] : "";
            const startsWord = index === 0 ||
                previous.charCodeAt(0) < 0x20 ||
                /\s/.test(previous) ||
                previous === "]";

            if (startsWord) {
                let end = index;
                while (end < text.length) {
                    const current = text[end];
                    if (text.charCodeAt(end) < 0x20 || /\s/.test(current)) {
                        break;
                    }
                    end++;
                }

                const word = text.slice(index, end);
                const buffer = textState.buffer || "";
                const visibleBuffer = buffer.replace(/^\u202B/, "");
                const bufferedWidth = this.textWidth(visibleBuffer);
                const committedWidth = Math.abs(textState.x - textState.startX);
                const currentLineWidth = committedWidth + bufferedWidth;
                const wordWidth = this.textWidth(word);
                const lineWidth = this.contentsWidth() -
                    Math.max(0, textState.startX) - 4;

                if (currentLineWidth > 0 &&
                    wordWidth <= lineWidth &&
                    currentLineWidth + wordWidth > lineWidth) {
                    this.flushTextState(textState);
                    this.processNewLine(textState);
                }
            }
        }

        _Window_Help_processCharacter.call(this, textState);
    };
})();
