import { lazy, Suspense, useRef } from "react";
import { languageFor } from "../../lib/language";

// Monaco is large; load it (and its workers) only when a file is opened.
const MonacoEditor = lazy(async () => {
  await import("./monacoSetup");
  const m = await import("@monaco-editor/react");
  return { default: m.default };
});

interface Props {
  name: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function Editor({ name, value, readOnly, onChange, onSave }: Props) {
  // Monaco commands are registered once on mount. Route them through a ref so Ctrl+S always runs
  // the latest handler (current content and etag), never the one captured at first render.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-ck-muted">Loading editor…</div>}>
      <MonacoEditor
        height="100%"
        theme="cockpit"
        path={name}
        language={languageFor(name)}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={(editor, monaco) => {
          // Ctrl/Cmd+S saves instead of triggering the browser's "save page".
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
          editor.focus();
        }}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "ui-monospace, 'JetBrains Mono', 'Fira Code', monospace",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          renderWhitespace: "selection",
          smoothScrolling: true,
          padding: { top: 12 },
        }}
      />
    </Suspense>
  );
}
