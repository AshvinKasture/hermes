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
  const [watchInput, setWatchInput] = useState('')
  const [consoleInput, setConsoleInput] = useState('')
  const consoleEndRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<typeof monacoEditor | null>(null)
  const decorationsRef = useRef<string[]>([])
  const hoverDecorationRef = useRef<string[]>([])
  const codeRef = useRef(code)
  codeRef.current = code

  const dbg = useDebugger()
  const dbgRef = useRef(dbg)
  dbgRef.current = dbg

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
    // F10 step over, F11 step into, Shift+F11 step out - standard debugger shortcuts
    // (VS/VS Code convention). Only act while actually paused; otherwise a no-op.
    editor.addCommand(monacoNs.KeyCode.F10, () => {
      if (dbgRef.current.status === 'paused') void dbgRef.current.stepOver()
    })
    editor.addCommand(monacoNs.KeyCode.F11, () => {
      if (dbgRef.current.status === 'paused') void dbgRef.current.stepIn()
    })
    editor.addCommand(monacoNs.KeyMod.Shift | monacoNs.KeyCode.F11, () => {
      if (dbgRef.current.status === 'paused') void dbgRef.current.stepOut()
    })
    editor.onMouseDown((e) => {
      if (e.target.type === monacoNs.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
        dbgRef.current.toggleBreakpoint(e.target.position.lineNumber)
      }
    })
    // Faded breakpoint-outline preview on hover, so it's clear exactly which line a click
    // will toggle - the glyph margin is narrow and otherwise hard to aim precisely.
    editor.onMouseMove((e) => {
      if (e.target.type === monacoNs.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
        const line = e.target.position.lineNumber
        if (dbgRef.current.breakpointLines.includes(line)) {
          hoverDecorationRef.current = editor.deltaDecorations(hoverDecorationRef.current, [])
          return
        }
        hoverDecorationRef.current = editor.deltaDecorations(hoverDecorationRef.current, [
          {
            range: new monacoNs.Range(line, 1, line, 1),
            options: { isWholeLine: false, glyphMarginClassName: 'breakpoint-glyph-hover' },
          },
        ])
      } else {
        hoverDecorationRef.current = editor.deltaDecorations(hoverDecorationRef.current, [])
      }
    })
    editor.onMouseLeave(() => {
      hoverDecorationRef.current = editor.deltaDecorations(hoverDecorationRef.current, [])
    })
  }

  const startDebug = useCallback(() => {
    void dbg.startDebugging(codeRef.current)
  }, [dbg])

  // Auto-scroll the debug console to the latest entry.
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ block: 'end' })
  }, [dbg.consoleHistory])

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
              <button disabled={dbg.status !== 'paused'} onClick={() => void dbg.stepOver()} title="Step Over (F10)">
                ⤵
              </button>
              <button disabled={dbg.status !== 'paused'} onClick={() => void dbg.stepIn()} title="Step Into (F11)">
                ⤷
              </button>
              <button disabled={dbg.status !== 'paused'} onClick={() => void dbg.stepOut()} title="Step Out (Shift+F11)">
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
              <div className="debug-section-header">Watch</div>
              <div className="debug-section-body">
                <form
                  className="watch-input-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    dbg.addWatch(watchInput)
                    setWatchInput('')
                  }}
                >
                  <input
                    className="watch-input"
                    type="text"
                    placeholder="Add expression (e.g. sum, x + y)"
                    value={watchInput}
                    onChange={(e) => setWatchInput(e.target.value)}
                  />
                  <button type="submit" className="watch-add-btn" disabled={!watchInput.trim()}>
                    +
                  </button>
                </form>
                {dbg.watchExpressions.length === 0 && (
                  <span className="output-placeholder">No watch expressions yet.</span>
                )}
                {dbg.watchExpressions.map((expr) => {
                  const result = dbg.watchResults.find((w) => w.expression === expr)
                  return (
                    <div key={expr} className="variable-row watch-row">
                      <span className="variable-name">{expr}</span>
                      <span className={result?.error ? 'variable-value watch-error' : 'variable-value'}>
                        {result ? result.value : dbg.status === 'paused' ? '…' : '—'}
                      </span>
                      <button className="watch-remove-btn" onClick={() => dbg.removeWatch(expr)} title="Remove watch">
                        ×
                      </button>
                    </div>
                  )
                })}
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
            <div className="debug-section debug-console-section">
              <div className="debug-section-header console-header">
                <span>Debug Console</span>
                <button className="console-clear-btn" onClick={dbg.clearConsole} title="Clear console">
                  Clear
                </button>
              </div>
              <div className="console-body">
                {dbg.consoleHistory.length === 0 && (
                  <span className="output-placeholder">
                    Evaluate expressions while paused (e.g. <code>x</code>, <code>x + y</code>, <code>Square(x)</code>). Assignment
                    and void calls aren't supported by the debugger.
                  </span>
                )}
                {dbg.consoleHistory.map((entry) => (
                  <div key={entry.id} className="console-entry">
                    <div className="console-expr">&gt; {entry.expression}</div>
                    <div className={entry.pending ? 'console-result console-pending' : entry.error ? 'console-result console-result-error' : 'console-result'}>
                      {entry.pending ? '…' : entry.result}
                    </div>
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </div>
              <form
                className="console-input-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  dbg.evaluateConsole(consoleInput)
                  setConsoleInput('')
                }}
              >
                <span className="console-prompt">&gt;</span>
                <input
                  className="console-input"
                  type="text"
                  placeholder={dbg.status === 'paused' ? 'Evaluate an expression…' : 'Pause at a breakpoint to evaluate'}
                  value={consoleInput}
                  onChange={(e) => setConsoleInput(e.target.value)}
                  disabled={dbg.status !== 'paused'}
                />
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
