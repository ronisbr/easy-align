import * as vscode from 'vscode';

/******************************************************************************************
 *                                   Auxiliary Functions                                  *
 ******************************************************************************************/

/**
 * Escape special characters in a string for use in a RegExp.
 *
 * @param string Input string.
 * @returns Escaped string for use in RegExp.
 */
function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Simple debounce utility.
 *
 * @param fn Function to debounce.
 * @param delay Delay in milliseconds.
 */
function createDebounced<T extends (...args: any[]) => void>(fn: T, delay: number) {
    let timer: NodeJS.Timeout | undefined;
    return {
        run: (...args: Parameters<T>) => {
            if (timer) {
                clearTimeout(timer);
            }

            timer = setTimeout(() => fn(...args), delay);
        },
        cancel: () => {
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
        }
    };
}

/**
 * Helper to replace the text and ensure the selection covers the new text.
 *
 * @param editor Current text editor.
 * @param startPos Starting position of the text to replace.
 * @param newText New text to insert.
 */
async function updateEditor(
    editor: vscode.TextEditor,
    startPos: vscode.Position,
    newText: string
) {
    // Replace the currently selected text.
    await editor.edit(
        editBuilder => {
            editBuilder.replace(editor.selection, newText);
        },
        {
            undoStopBefore: false,
            undoStopAfter: false
        }
    );

    // Calculate new end position to keep the text selected. This is crucial because
    // 'replace' might collapse the selection.
    const lines = newText.split('\n');
    const lineCount = lines.length;
    const lastLineLen = lines[lines.length - 1].length;

    const startLine = startPos.line;

    const newStartPos = new vscode.Position(startLine, 0);
    const newEndPos = new vscode.Position(startLine + lineCount - 1, lastLineLen);

    // Re-select the new text range so the next edit/revert works correctly.
    editor.selection = new vscode.Selection(newStartPos, newEndPos);
}

/**
 * Check if VSCodeVim is installed and active.
 */
function isVSCodeVimActive(): boolean {
  const extension = vscode.extensions.getExtension("vscodevim.vim");
  return extension !== undefined && extension.isActive;
}

/**
 * Update the editor with aligned text based on the input pattern and flags.
 *
 * @param editor Current text editor.
 * @param startPos Starting position where the original text begins.
 * @param originalText Original text to align (used for validation and revert).
 * @param inputBox Input box containing the user's pattern and flags.
 */
async function updateEditorWithAlignedText(
    editor: vscode.TextEditor,
    startPos: vscode.Position,
    originalText: string,
    inputBox: vscode.InputBox
): Promise<void> {
    const input = inputBox.value;

    // Parse pattern and flags.
    let pattern = input;
    let isAfter = false;
    let isGlobal = false;
    let isRegex = false;
    let isRight = false;
    let globalCount = 0;

    // Check for flags at the end of the input. The valid options are:
    //  - g: global (all occurrences).
    //  - n: next (after the pattern).
    //  - r: right align.
    const flagMatch = input.match(/^(.*)\/((?:g\d*|[nr])+)+$/);

    if (flagMatch) {
        // Extract pattern without trailing flags.
        pattern = flagMatch[1];
        const flags = flagMatch[2];

        if (flags.includes('n')) {
            isAfter = true;
        }
        if (flags.includes('r')) {
            isRight = true;
        }

        // Check for global flag with optional number.
        const globalMatch = flags.match(/g(\d*)/);

        if (globalMatch) {
            isGlobal = true;

            // If number exists, parse it. If empty string, default to 0.
            globalCount = globalMatch[1] ? parseInt(globalMatch[1], 10) : 0;
        }
    }

    // Check for regex prefix, which treats the pattern as a regex.
    if (pattern.startsWith('r/')) {
        isRegex = true;
        pattern = pattern.substring(2);
    }

    // If pattern becomes empty due to parsing, revert.
    if (!pattern) {
        await updateEditor(editor, startPos, originalText);
        return;
    }

    // Validate regex early to provide feedback.
    if (isRegex) {
        try {
            new RegExp(pattern);
        } catch (e: unknown) {
            inputBox.validationMessage = "Invalid regex pattern.";
            await updateEditor(editor, startPos, originalText);
            return;
        }
    }

    inputBox.validationMessage = "";

    // Calculate alignment based on the original text.
    const alignedText = alignText(
        originalText,
        pattern,
        isAfter,
        isGlobal,
        globalCount,
        isRegex,
        isRight
    );

    // Apply edit and update selection
    await updateEditor(editor, startPos, alignedText);
}

/******************************************************************************************
 *                                      Main Logic                                        *
 ******************************************************************************************/

/**
 * Align text based on a given pattern.
 *
 * @param text Text to be aligned.
 * @param pattern Pattern to align the text (string or regex).
 * @param isAfter If `true`, align the character just after the end of the pattern.
 * @param isGlobal If `true`, align all occurrences per line, or only the first occurrence
 *                 otherwise.
 * @param globalCount If `isGlobal` is `true`, this variable holds the maximum number of
 *                    occurrences to align per line. If `0`, align all occurrences.
 * @param isRegex If `true`, treat the pattern as a regular expression or a literal string
 *                otherwise.
 * @param isRight If `true`, align to the right, or to the left otherwise.
 * @returns The aligned text.
 */
function alignText(
    text: string,
    pattern: string,
    isAfter: boolean,
    isGlobal: boolean,
    globalCount: number,
    isRegex: boolean,
    isRight: boolean
): string {
    const lines = text.split('\n');

    // Create regex (default to literal string behavior if invalid regex)
    let regex: RegExp;

    try {
        regex = new RegExp(isRegex ? pattern : escapeRegExp(pattern));
    } catch (e: unknown) {
        return text;
    }

    // == Step 1: Tokenize =================================================================
    //
    // Split each line into parts: [Text, Delimiter, Text, Delimiter...].

    const tokenizedLines = lines.map(line => {
        if (isGlobal) {
            // Global mode, meaning that we can consider all occurrences in the line,
            // depending on the configuration of the variable `globalCount`.

            // Use capturing group to keep delimiters in the split result.
            const safePattern = isRegex ? pattern : escapeRegExp(pattern);
            const captureRegex = new RegExp(`(${safePattern})`, 'g');
            return line.split(captureRegex);
        }

        // Single match mode, meaning that we only consider the first occurrence.
        const match = line.match(regex);

        if (!match || match.index === undefined) return [line];

        const index = match.index;

        return [
            line.substring(0, index),
            match[0],
            line.substring(index + match[0].length)
        ];
    });

    // == Step 2: Calculate Column Widths ==================================================

    const colWidths: number[] = [];

    tokenizedLines.forEach(parts => {
        // The parts are structured as: Even = Text, Odd = Delimiter. Hence, the index in
        // the column width array is i / 2.
        for (let i = 0; i < parts.length; i += 2) {
            if (isGlobal && globalCount > 0 && i >= 2 * globalCount) break;

            const textPart = parts[i];
            const delimiterPart = parts[i + 1] || "";

            let width = textPart.length;

            // If aligning after, the text column includes the delimiter's width.
            if (isAfter) {
                width += delimiterPart.length;
            }

            const colIndex = i / 2;

            if (colWidths[colIndex] === undefined || width > colWidths[colIndex]) {
                colWidths[colIndex] = width;
            }
        }
    });

    // == Step 3: Reconstruct ==============================================================

    return tokenizedLines.map(parts => {
        let newLine = "";

        // The parts are structured as: Even = Text, Odd = Delimiter. Hence, the index in
        // the column width array is i / 2.
        for (let i = 0; i < parts.length; i += 2) {
            const textPart = parts[i];

            // If this is the last part, just append.
            if (i + 1 >= parts.length) {
                newLine += textPart;
                break;
            }

            const delimiter = parts[i + 1];
            const w = colWidths[i / 2];

            if (isGlobal && globalCount > 0 && i >= 2 * globalCount) {
                // Append the rest of the line as-is.
                newLine += textPart + delimiter;
                continue;
            }

            if (isAfter) {
                // Pattern: [Text][Delimiter][Padding].
                const pad = ' '.repeat(w - (textPart.length + delimiter.length));

                if (isRight) {
                    newLine += pad + textPart + delimiter;
                } else {
                    newLine += textPart + delimiter + pad;
                }
            } else {
                // Pattern: [Text][Padding][Delimiter].
                const pad = ' '.repeat(w - textPart.length);

                if (isRight) {
                    newLine += pad + textPart + delimiter;
                } else {
                    newLine += textPart + pad + delimiter;
                }
            }
        }

        return newLine;
    }).join('\n');
}

/******************************************************************************************
 *                                 Visual Studio Code API                                 *
 ******************************************************************************************/

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "EasyAlign.alignText",
        async () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor) return;

            // Maximum selection size for live preview (10k characters).
            // TODO: Make this configurable.
            const MAX_PREVIEW_SIZE = 10000;

            // == Capture the Original State ===============================================
            //
            // We will capture the entire lines covered by the selection.
            const selection       = editor.selection;
            const startLine       = selection.start.line;
            const endLine         = selection.end.line;
            const startPos        = new vscode.Position(startLine, 0);
            const endPos          = editor.document.lineAt(endLine).range.end;
            const fullLineRange   = new vscode.Range(startPos, endPos);
            const originalText    = editor.document.getText(fullLineRange);
            const isHugeSelection = originalText.length > MAX_PREVIEW_SIZE;

            let largeSelectionWarned = false;

            if (!originalText) {
                vscode.window.showInformationMessage("No text selected.");
                return;
            }

            // We need to select the full lines to ensure proper replacement.
            editor.selection = new vscode.Selection(startPos, endPos);

            // == Show Input Box ===========================================================

            const inputBox = vscode.window.createInputBox();

            inputBox.title       = "Align Text";
            inputBox.placeholder = "Delimiter pattern for alignment.";
            inputBox.value       = "";

            inputBox.show();

            // State tracking
            let accepted = false;

            // Debounced handler to avoid excessive edits while typing.
            const {
                run: runChange,
                cancel: cancelChange
            } = createDebounced(
                async (value: string) => {
                    // If empty, show the original text.
                    if (!value) {
                        await updateEditor(editor, startPos, originalText);
                        inputBox.validationMessage = "";
                        return;
                    }

                    // For normal-sized selections, provide live preview.
                    if (!isHugeSelection) {
                        await updateEditorWithAlignedText(
                            editor,
                            startPos,
                            originalText,
                            inputBox
                        );
                        return;
                    }

                    // Skip live preview for very large selections to avoid performance
                    // issues.
                    if (!largeSelectionWarned) {
                        vscode.window.showInformationMessage("Selection is large; live preview disabled. Press Enter to apply.");
                        largeSelectionWarned = true;
                    }

                    inputBox.validationMessage = "";

                    // We still need to verify if the regex is valid to provide feedback.
                    let pattern = value;

                    if (pattern.startsWith('r/')) {
                        pattern = pattern.substring(2);

                        // Validate regex early to provide feedback.
                        try {
                            new RegExp(pattern);
                        } catch (e: unknown) {
                            inputBox.validationMessage = "Invalid regex pattern.";
                        }
                    }
                },
                150
            );

            inputBox.onDidChangeValue(runChange);

            inputBox.onDidAccept(
                async () => {
                    accepted = true;

                    // For huge selections, compute and apply once on accept.
                    if (isHugeSelection) {
                        await updateEditorWithAlignedText(
                            editor,
                            startPos,
                            originalText,
                            inputBox
                        );
                    }

                    inputBox.hide();
                }
            );

            inputBox.onDidHide(
                async () => {
                    // Cancel any pending debounced change to avoid late edits.
                    cancelChange();

                    if (!accepted) {
                        // User pressed Esc or clicked away. In this case, revert to
                        // original text. Notice that we must restore the selection because
                        // if the user clicked outside the input dialog, the selection might
                        // have changed. Additionally, we must re-calculate the end position
                        // based on the original text.
                        const newEndPos = editor.document.lineAt(endLine).range.end;
                        editor.selection = new vscode.Selection(startPos, newEndPos);
                        await updateEditor(editor, startPos, originalText);
                    }

                    inputBox.dispose();

                    // Get the position where the cursor currently is (the "active" end of
                    // the selection).
                    const position = editor.selection.active;

                    // Create a new selection where start and end are the same. This places
                    // the cursor at that position without any selection.
                    editor.selection = new vscode.Selection(position, position);

                    // If VSCodeVim is active, send an 'escape' command to exit visual mode.
                    const vimActive = isVSCodeVimActive();

                    if (vimActive) {
                        await vscode.commands.executeCommand("vim.remap", {
                            after: ["escape"]
                        });
                    }
                }
            );
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() { }
