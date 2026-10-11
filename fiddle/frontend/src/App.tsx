import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
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

function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [output, setOutput] = useState<string>('')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

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
        body: JSON.stringify({ code }),
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
  }, [code])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      void runCode()
    })
  }

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

  return (
    <div className="app">
      <header className="topbar">
        <h1>C# Fiddle</h1>
        <div className="topbar-right">
          {me?.email && <span className="user-email">{me.email}</span>}
          <button className="run-btn" onClick={() => void runCode()} disabled={running}>
            {running ? 'Running…' : 'Run ▶ (Ctrl+Enter)'}
          </button>
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
            options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true }}
          />
        </div>
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
      </main>
    </div>
  )
}

export default App
