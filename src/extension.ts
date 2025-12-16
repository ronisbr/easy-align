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

/******************************************************************************************
 *                                      Main Logic                                        *
 ******************************************************************************************/

/**
 * Align text based on a given pattern.
 *
 * @param text Text to be aligned.
 * @param pattern Pattern to align the text (string or regex).
 * @param isGlobal If `true`, align all occurrences per line, or only the first occurrence
 *                 otherwise.
 * @param isAfter If `true`, align the character just after the end of the pattern.
 * @returns The aligned text.
 */
function alignText(
    text: string,
    pattern: string,
    isRegex: boolean,
    isGlobal: boolean,
    isAfter: boolean
): string {
    const lines = text.split('\n');

    // Create regex (default to literal string behavior if invalid regex)
    let regex: RegExp;
    try {
        regex = new RegExp(isRegex ? pattern : escapeRegExp(pattern));
    } catch {
        return text;
    }

    // == Step 1: Tokenize =================================================================
    //
    // Split each line into parts: [Text, Delimiter, Text, Delimiter...].
    const tokenizedLines = lines.map(line => {
        if (isGlobal) {
            // Global mode, meaning that we will consider all occurrences in the line.

            // Use capturing group to keep delimiters in the split result.
            const captureRegex = new RegExp(`(${pattern})`, 'g');
            return line.split(captureRegex);
        }

        // Single match mode, meaning that we only consider the first occurrence.
        const match = regex.exec(line);

        if (!match) return [line];

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
            const textPart = parts[i];
            const delimiterPart = parts[i + 1] || "";

            let width = textPart.length;

            // If aligning after, the text column includes the delimiter's width.
            if (isAfter) width += delimiterPart.length;

            const colIndex = i / 2;

            if (colWidths[colIndex] === undefined || width > colWidths[colIndex])
                colWidths[colIndex] = width;
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

            if (isAfter) {
                // Pattern: [Text][Delimiter][Padding].
                const pad = ' '.repeat(w - (textPart.length + delimiter.length));
                newLine += textPart + delimiter + pad;
            } else {
                // Pattern: [Text][Padding][Delimiter].
                const pad = ' '.repeat(w - textPart.length);
                newLine += textPart + pad + delimiter;
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

            // == Capture the Original State ===============================================
            //
            // We will capture the entire lines covered by the selection.
            const selection = editor.selection;

            const startLine = selection.start.line;
            const endLine = selection.end.line;
            const startPos = new vscode.Position(startLine, 0);
            const endPos = editor.document.lineAt(endLine).range.end;

            const fullLineRange = new vscode.Range(startPos, endPos);
            const originalText = editor.document.getText(fullLineRange);

            if (!originalText) {
                vscode.window.showInformationMessage('No text selected.');
                return;
            }

            // We need to select the full lines to ensure proper replacement.
            editor.selection = new vscode.Selection(startPos, endPos);

            // == Show Input Box ===========================================================

            const inputBox = vscode.window.createInputBox();
            inputBox.title = "Align Text";
            inputBox.placeholder = "Delimiter pattern for alignment.";
            inputBox.prompt = "Use \"r/\" (beginning) for regex, \"/g\" (end) for global, \"/n\" (end) for next.";
            inputBox.value = "";
            inputBox.show();

            // State tracking
            let accepted = false;

            inputBox.onDidChangeValue(
                async (value) => {
                    // If empty, show the original text.
                    if (!value) {
                        await updateEditor(editor, startPos, originalText);
                        return;
                    }

                    // Parse pattern and flags.
                    let pattern = value;
                    let isRegex = false;
                    let isGlobal = false;
                    let isAfter = false;

                    // Check for flags at the end of the input. The valid options are:
                    //  - g: global (all occurrences).
                    //  - n: next (after the pattern).
                    const flagMatch = value.match(/^(.*)\/([gn]+)$/);

                    if (flagMatch) {
                        pattern = flagMatch[1];
                        if (flagMatch[2].includes('g'))
                            isGlobal = true;

                        if (flagMatch[2].includes('n'))
                            isAfter = true;
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

                    // Calculate alignment based on the original text.
                    const alignedText = alignText(
                        originalText,
                        pattern,
                        isRegex,
                        isGlobal,
                        isAfter
                    );

                    // Apply edit and update selection
                    await updateEditor(editor, startPos, alignedText);
                }
            );

            inputBox.onDidAccept(
                () => {
                    accepted = true;
                    inputBox.hide();
                }
            );

            inputBox.onDidHide(
                async () => {
                    if (!accepted) {
                        // User pressed Esc or clicked away. In this case, revert to
                        // original text. Notice that we must restore the selection because
                        // if the user clicked outside the input dialog, the selection might
                        // have changed.
                        editor.selection = new vscode.Selection(startPos, endPos);
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
