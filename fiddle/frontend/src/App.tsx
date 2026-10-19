import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monacoEditor from 'monaco-editor'
import { useDebugger } from './debug/useDebugger'
import './App.css'

const DEFAULT_CODE = `using System;

class Program
{
    static void Main()
    {
        Console.WriteLine("Hello, Fiddle!");
    }
}
`

interface RunResponse {
  success: boolean
  output: string
  error: string | null
  elapsedMs: number
  timedOut: boolean
}

interface Me {
  authenticated: boolean
  email?: string
  name?: string
}

type Mode = 'run' | 'debug'

function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [output, setOutput] = useState<string>('')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [mode, setMode] = useState<Mode>('run')
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<typeof monacoEditor | null>(null)
  const decorationsRef = useRef<string[]>([])
  const codeRef = useRef(code)
  codeRef.current = code

  const dbg = useDebugger()

  useEffect(() => {
    fetch('/fiddle/api/auth/me')
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ authenticated: false }))
  }, [])

  const runCode = useCallback(async () => {
    setRunning(true)
    setErrorText(null)
    setOutput('')
    setElapsedMs(null)
    try {
      const res = await fetch('/fiddle/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeRef.current }),
      })
      if (res.status === 401) {
        window.location.href = '/fiddle/api/auth/login'
        return
      }
      const data: RunResponse = await res.json()
      setOutput(data.output || '')
      setErrorText(data.error)
      setElapsedMs(data.elapsedMs)
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setRunning(false)
    }
  }, [])

  // Keep Monaco's breakpoint gutter dots in sync with dbg.breakpointLines, and highlight the
  // current execution line when paused.
  useEffect(() => {
    const editor = editorRef.current
    const monacoNs = monacoRef.current
    if (!editor || !monacoNs) return

    const decorations: monacoEditor.editor.IModelDeltaDecoration[] = dbg.breakpointLines.map((line) => ({
      range: new monacoNs.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'breakpoint-glyph',
      },
    }))

    if (dbg.currentLine != null) {
      decorations.push({
        range: new monacoNs.Range(dbg.currentLine, 1, dbg.currentLine, 1),
        options: {
          isWholeLine: true,
          className: 'current-line-highlight',
        },
      })
    }

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations)
  }, [dbg.breakpointLines, dbg.currentLine])

  const handleMount: OnMount = (editor, monacoNs) => {
    editorRef.current = editor
    monacoRef.current = monacoNs
    editor.updateOptions({ glyphMargin: true })
    editor.addCommand(monacoNs.KeyMod.CtrlCmd | monacoNs.KeyCode.Enter, () => {
      void runCode()
    })
    editor.onMouseDown((e) => {
      if (e.target.type === monacoNs.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
        dbg.toggleBreakpoint(e.target.position.lineNumber)
      }
    })
  }

  const startDebug = useCallback(() => {
    void dbg.startDebugging(codeRef.current)
  }, [dbg])

  if (me && !me.authenticated) {
    return (
      <div className="login-screen">
        <h1>C# Fiddle</h1>
        <p>Sign in to use the compiler.</p>
        <a className="login-btn" href="/fiddle/api/auth/login">
          Sign in with Google
        </a>
      </div>
    )
  }

  const debugActive = dbg.status !== 'idle'

  return (
    <div className="app">
      <header className="topbar">
        <h1>C# Fiddle</h1>
        <div className="mode-toggle">
          <button className={mode === 'run' ? 'mode-btn active' : 'mode-btn'} onClick={() => setMode('run')}>
            Run
          </button>
          <button className={mode === 'debug' ? 'mode-btn active' : 'mode-btn'} onClick={() => setMode('debug')}>
            Debug
          </button>
        </div>
        <div className="topbar-right">
          {me?.email && <span className="user-email">{me.email}</span>}
          {mode === 'run' && (
            <button className="run-btn" onClick={() => void runCode()} disabled={running}>
              {running ? 'Running…' : 'Run ▶ (Ctrl+Enter)'}
            </button>
          )}
          {mode === 'debug' && !debugActive && (
            <button className="run-btn debug-btn" onClick={startDebug}>
              Start Debugging ▶
            </button>
          )}
          {mode === 'debug' && debugActive && (
            <div className="debug-toolbar">
              <button disabled={dbg.status !== 'paused'} onClick={() => void dbg.continueExec()} title="Continue">
                ▶
              </button>
              <button disabled={dbg.status !== 'paused'} onClick={() => void dbg.stepOver()} title="Step Over">
                ⤵
              </button>
              <button disabled={dbg.status !== 'paused'} onClick={() => void dbg.stepIn()} title="Step Into">
                ⤷
              </button>
              <button disabled={dbg.status !== 'paused'} onClick={() => void dbg.stepOut()} title="Step Out">
                ⤴
              </button>
              <button onClick={dbg.stopDebugging} title="Stop" className="debug-stop">
                ■
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="main">
        <div className="editor-pane">
          <Editor
            height="100%"
            defaultLanguage="csharp"
            value={code}
            onChange={(v) => setCode(v ?? '')}
            onMount={handleMount}
            theme="vs-dark"
            options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true, glyphMargin: true }}
          />
        </div>
        {mode === 'run' && (
          <div className="output-pane">
            <div className="output-header">
              Output
              {elapsedMs !== null && <span className="elapsed">{elapsedMs} ms</span>}
            </div>
            <pre className="output-body">
              {output}
              {errorText && <span className="output-error">{errorText}</span>}
              {!output && !errorText && !running && (
                <span className="output-placeholder">Run your code to see output here.</span>
              )}
            </pre>
          </div>
        )}
        {mode === 'debug' && (
          <div className="debug-pane">
            <div className="debug-status">
              <span className={`status-badge status-${dbg.status}`}>{dbg.status}</span>
              {dbg.statusMessage && <span className="status-message">{dbg.statusMessage}</span>}
            </div>
            <div className="debug-section">
              <div className="debug-section-header">Call Stack</div>
              <div className="debug-section-body">
                {dbg.stackFrames.length === 0 && <span className="output-placeholder">No active frames.</span>}
                {dbg.stackFrames.map((f) => (
                  <div key={f.id} className="stack-frame">
                    {f.name} <span className="stack-frame-line">:{f.line}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="debug-section">
              <div className="debug-section-header">Variables</div>
              <div className="debug-section-body">
                {dbg.variables.length === 0 && <span className="output-placeholder">No variables in scope.</span>}
                {dbg.variables.map((v) => (
                  <div key={v.name} className="variable-row">
                    <span className="variable-name">{v.name}</span>
                    <span className="variable-value">{v.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="debug-section">
              <div className="debug-section-header">Program Output</div>
              <pre className="output-body debug-output">
                {dbg.debuggerOutput.join('')}
                {dbg.debuggerOutput.length === 0 && (
                  <span className="output-placeholder">Click a line's left margin to set a breakpoint, then Start Debugging.</span>
                )}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
