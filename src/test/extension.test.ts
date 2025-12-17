import * as assert from "assert";
import * as vscode from "vscode";
import { escapeRegExp, alignText } from "../extension";

suite("Extension Test Suite", () => {
    vscode.window.showInformationMessage("Start all tests.");

    suite("escapeRegExp", () => {
        test("Empty String", () => {
            assert.strictEqual(escapeRegExp(""), "");
        });

        test("Escape Special Regex Characters", () => {
            assert.strictEqual(escapeRegExp("test.txt"), "test\\.txt");
            assert.strictEqual(escapeRegExp("a*b+c?"),   "a\\*b\\+c\\?");
            assert.strictEqual(escapeRegExp("[a-z]"),    "\\[a-z\\]");
            assert.strictEqual(escapeRegExp("a|b"),      "a\\|b");
            assert.strictEqual(escapeRegExp("a^b$c"),    "a\\^b\\$c");
            assert.strictEqual(escapeRegExp("a{2,3}"),   "a\\{2,3\\}");
            assert.strictEqual(escapeRegExp("a(b)c"),    "a\\(b\\)c");
            assert.strictEqual(escapeRegExp("a\\b"),     "a\\\\b");
        });

        test("Strings Without Special Characters", () => {
            assert.strictEqual(escapeRegExp("abc123"),      "abc123");
            assert.strictEqual(escapeRegExp("hello world"), "hello world");
        });
    });

    suite("alignText - Basic Alignment", () => {
        test("Simple Text with Single Delimiter", () => {
            const input    = "a = 1\nab = 2\nabc = 3";
            const expected = "a   = 1\nab  = 2\nabc = 3";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Multiple Different Delimiters", () => {
            const input    = "x = 1\ny = 2\nz = 3";
            const expected = "x = 1\ny = 2\nz = 3";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Lines Without Delimiter (Not Forced)", () => {
            const input    = "a = 1\nno delimiter\nbc = 2";
            const expected = "a  = 1\nno delimiter\nbc = 2";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Lines Without Delimiter (Forced)", () => {
            const input    = "a = 1\nno delimiter\nbc = 2";
            const expected = "a           = 1\nno delimiter\nbc          = 2";
            const result   = alignText(input, "=", false, true, false, 0, false, false);

            assert.strictEqual(result, expected);
        });
    });

    suite("alignText - After Mode", () => {
        test("After Mode", () => {
            const input    = "a = 1\nab = 2\nabc = 3";
            const expected = "a =   1\nab =  2\nabc = 3";
            const result   = alignText(input, "=", true, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });
    });

    suite("alignText - Right Alignment", () => {
        test("Right-Align Text", () => {
            const input    = "a = 1\nab = 2\nabc = 3";
            const expected = "  a = 1\n ab = 2\nabc = 3";
            const result   = alignText(input, "=", false, false, false, 0, false, true);

            assert.strictEqual(result, expected);
        });

        test("Right-Align Text After Delimiter", () => {
            const input    = "a = 1\nab = 2\nabc = 3";
            const expected = "  a = 1\n ab = 2\nabc = 3";
            const result   = alignText(input, "=", true, false, false, 0, false, true);

            assert.strictEqual(result, expected);
        });
    });

    suite("alignText - Global Mode", () => {
        test("All Occurrences", () => {
            const input    = "a = 1 = x\nab = 2 = y\nabc = 3 = z";
            const expected = "a   = 1 = x\nab  = 2 = y\nabc = 3 = z";
            const result   = alignText(input, "=", false, false, true, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Global Count", () => {
            const input    = "a = 1 = x = p\nab = 2 = y = q\nabc = 3 = z = r";
            const expected = "a   = 1 = x = p\nab  = 2 = y = q\nabc = 3 = z = r";
            const result   = alignText(input, "=", false, false, true, 2, false, false);

            assert.strictEqual(result, expected);
        });

        test("First Occurrence", () => {
            const input    = "a = 1 = x\nab = 2 = y\nabc = 3 = z";
            const expected = "a   = 1 = x\nab  = 2 = y\nabc = 3 = z";
            const result   = alignText(input, "=", false, false, true, 1, false, false);

            assert.strictEqual(result, expected);
        });
    });

    suite("alignText - Regex Mode", () => {
        test("Regex Pattern", () => {
            const input    = "a  =  1\nab   =   2\nabc    =    3";
            const expected = "a    =  1\nab    =   2\nabc    =    3";
            const result   = alignText(input, "\\s+=", false, false, false, 0, true, false);

            assert.strictEqual(result, expected);
        });

        test("Invalid Regex", () => {
            const input  = "a = 1\nab = 2";
            const result = alignText(input, "[invalid", false, false, false, 0, true, false);
            
            assert.strictEqual(result, input);
        });
    });

    suite("alignText - Edge Cases", () => {
        test("Empty Strings", () => {
            const result = alignText("", "=", false, false, false, 0, false, false);
            assert.strictEqual(result, "");
        });

        test("Single Line", () => {
            const input    = "a = 1";
            const expected = "a = 1";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Delimiter at Start of Line", () => {
            const input    = "= 1\n= 2\n= 3";
            const expected = "= 1\n= 2\n= 3";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Delimiter at End of Line", () => {
            const input    = "a =\nab =\nabc =";
            const expected = "a   =\nab  =\nabc =";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("No Content After Delimiter", () => {
            const input    = "a = \nab = \nabc = ";
            const expected = "a   = \nab  = \nabc = ";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Delimiter Not Found in Any Line", () => {
            const input    = "a b c\nd e f\ng h i";
            const expected = "a b c\nd e f\ng h i";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });
    });

    suite("alignText - Complex Scenarios", () => {
        test("JSON-like structure", () => {
            const input    = '"name": "John",\n"age": 30,\n"city": "NYC"';
            const expected = '"name": "John",\n"age" : 30,\n"city": "NYC"';
            const result   = alignText(input, ":", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Variable Assignments", () => {
            const input    = "let x = 1;\nlet y = 2;\nlet z = 3;";
            const expected = "let x = 1;\nlet y = 2;\nlet z = 3;";
            const result   = alignText(input, "=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });

        test("Align With Spaces In Delimiter", () => {
            const input    = "a := 1\nab := 2\nabc := 3";
            const expected = "a   := 1\nab  := 2\nabc := 3";
            const result   = alignText(input, ":=", false, false, false, 0, false, false);

            assert.strictEqual(result, expected);
        });
    });
});

