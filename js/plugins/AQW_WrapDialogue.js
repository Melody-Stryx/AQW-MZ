/*:
 * @target MZ
 * @plugindesc Automatically wraps dialogue text at word boundaries.
 * @author AQW-MZ
 *
 * @help
 * Dialogue-only word wrapping. Preserves manual line breaks and escape codes.
 */
(() => {
    "use strict";

    const _Window_Message_processCharacter =
        Window_Message.prototype.processCharacter;

    Window_Message.prototype.processCharacter = function(textState) {
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
                const usedWidth = Math.abs(textState.x - textState.startX);
                const hasLineContent =
                    usedWidth > 0 || visibleBuffer.trim().length > 0;

                // MZ message text states start with width 0.
                const edgeMargin = 4;
                const lineWidth = textState.rtl
                    ? textState.startX - edgeMargin
                    : this.innerWidth - textState.startX - edgeMargin;
                const candidateWidth = this.textWidth(buffer + word);

                if (hasLineContent &&
                    usedWidth + candidateWidth > lineWidth) {
                    this.flushTextState(textState);
                    this.processNewLine(textState);
                }
            }
        }

        _Window_Message_processCharacter.call(this, textState);
    };
})();
