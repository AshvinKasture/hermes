// Load Monaco from the app bundle (not a CDN): the CSP only allows our own origin.
//
// The stock `monaco-editor` entry bundles a TypeScript language service and 80 tokenizers, which
// exhausts memory when building on this small VM. A file browser needs syntax highlighting, not
// IntelliSense, so we load the editor core, the generated contribution list, a chosen set of
// tokenizers, and JSON validation. See monacoContrib.ts.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-vs/editor/editor.api.js";
import "./monacoContrib";
import "monaco-vs/languages/definitions/javascript/register.js";
import "monaco-vs/languages/definitions/typescript/register.js";
import "monaco-vs/languages/definitions/python/register.js";
import "monaco-vs/languages/definitions/shell/register.js";
import "monaco-vs/languages/definitions/yaml/register.js";
import "monaco-vs/languages/definitions/markdown/register.js";
import "monaco-vs/languages/definitions/ini/register.js";
import "monaco-vs/languages/definitions/dockerfile/register.js";
import "monaco-vs/languages/definitions/xml/register.js";
import "monaco-vs/languages/definitions/html/register.js";
import "monaco-vs/languages/definitions/css/register.js";
import "monaco-vs/languages/definitions/scss/register.js";
import "monaco-vs/languages/definitions/less/register.js";
import "monaco-vs/languages/definitions/sql/register.js";
import "monaco-vs/languages/definitions/go/register.js";
import "monaco-vs/languages/definitions/rust/register.js";
import "monaco-vs/languages/definitions/java/register.js";
import "monaco-vs/languages/definitions/cpp/register.js";
import "monaco-vs/languages/definitions/csharp/register.js";
import "monaco-vs/languages/definitions/php/register.js";
import "monaco-vs/languages/definitions/ruby/register.js";
import "monaco-vs/languages/features/json/register.js";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === "json" ? new jsonWorker() : new editorWorker();
  },
};

monaco.editor.defineTheme("cockpit", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#0b0d12",
    "editorGutter.background": "#0b0d12",
    "editor.lineHighlightBackground": "#141720",
    "editorLineNumber.foreground": "#4b5263",
    "editor.selectionBackground": "#6ea8fe33",
  },
});

loader.config({ monaco });
export { monaco };
