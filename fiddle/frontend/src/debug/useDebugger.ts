import { useCallback, useRef, useState } from 'react'
import { DapClient, type DapMessage } from './DapClient'

export interface StackFrame {
  id: number
  name: string
  line: number
  column: number
}

export interface Variable {
  name: string
  value: string
  variablesReference: number
}

export interface WatchResult {
  expression: string
  value: string
  error: boolean
}

export interface ConsoleEntry {
  id: number
  expression: string
  result: string | null
  error: boolean
  pending: boolean
}

export type DebugStatus = 'idle' | 'starting' | 'running' | 'paused' | 'terminated' | 'error'

export interface UseDebuggerResult {
  status: DebugStatus
  statusMessage: string | null
  currentLine: number | null
  stackFrames: StackFrame[]
  variables: Variable[]
  debuggerOutput: string[]
  breakpointLines: number[]
  watchExpressions: string[]
  watchResults: WatchResult[]
  addWatch: (expression: string) => void
  removeWatch: (expression: string) => void
  consoleHistory: ConsoleEntry[]
  evaluateConsole: (expression: string) => void
  clearConsole: () => void
  toggleBreakpoint: (line: number) => void
  startDebugging: (code: string) => Promise<void>
  continueExec: () => Promise<void>
  stepOver: () => Promise<void>
  stepIn: () => Promise<void>
  stepOut: () => Promise<void>
  stopDebugging: () => void
}

export function useDebugger(): UseDebuggerResult {
  const [status, setStatus] = useState<DebugStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [currentLine, setCurrentLine] = useState<number | null>(null)
  const [stackFrames, setStackFrames] = useState<StackFrame[]>([])
  const [variables, setVariables] = useState<Variable[]>([])
  const [debuggerOutput, setDebuggerOutput] = useState<string[]>([])
  const [breakpointLines, setBreakpointLines] = useState<number[]>([])
  const [watchExpressions, setWatchExpressions] = useState<string[]>([])
  const [watchResults, setWatchResults] = useState<WatchResult[]>([])
  const [consoleHistory, setConsoleHistory] = useState<ConsoleEntry[]>([])

  const clientRef = useRef<DapClient | null>(null)
  const threadIdRef = useRef<number | null>(null)
  const topFrameIdRef = useRef<number | null>(null)
  const statusRef = useRef<DebugStatus>(status)
  statusRef.current = status
  const watchExpressionsRef = useRef<string[]>([])
  watchExpressionsRef.current = watchExpressions
  const consoleIdRef = useRef(0)

  /**
   * netcoredbg has two known evaluator bugs that surface as generic-looking errors:
   *
   * 1. Samsung/netcoredbg#246/#248: bare property access on a local (`foo.Length`,
   *    `foo.HasValue`) fails with "does not exist in the current context", even though the
   *    property genuinely exists - but calling the compiler-generated getter directly
   *    (`foo.get_Length()`) works, since method calls go through a different code path.
   * 2. String indexing (`str[0]`) fails with the opaque HRESULT "error: 0x80070057" - array
   *    indexing (`arr[0]`) is unaffected, only string's indexer specifically. The workaround is
   *    the same idea: call the compiler-generated indexer getter directly, `str.get_Chars(0)`.
   *
   * We retry a failed evaluation once, rewriting whichever pattern matches, before giving up -
   * so both work transparently without the user needing to know the debugger's quirks. Since we
   * can't know types ahead of time, the indexer rewrite is tried for ANY `expr[args]` on an
   * 0x80070057 failure (harmless if wrong - it'll just fail again with the original message).
   */
  async function evaluateWithKnownBugFallback(
    client: DapClient,
    expression: string,
    frameId: number | undefined,
    context: string,
  ): Promise<string> {
    try {
      const resp = await client.request('evaluate', { expression, frameId, context })
      return ((resp.body as Record<string, unknown>)?.result as string) ?? ''
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      const propertyMatch = /\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(expression)
      if (propertyMatch && message.includes('does not exist in the current context')) {
        const rewritten = `${expression.slice(0, propertyMatch.index)}.get_${propertyMatch[1]}()`
        const resp = await client.request('evaluate', { expression: rewritten, frameId, context })
        return ((resp.body as Record<string, unknown>)?.result as string) ?? ''
      }

      const indexerMatch = /\[(.+)\]$/.exec(expression)
      if (indexerMatch && message.includes('0x80070057')) {
        const rewritten = `${expression.slice(0, indexerMatch.index)}.get_Chars(${indexerMatch[1]})`
        const resp = await client.request('evaluate', { expression: rewritten, frameId, context })
        return ((resp.body as Record<string, unknown>)?.result as string) ?? ''
      }

      throw err
    }
  }

  const evaluateWatches = useCallback(async (frameId: number | null) => {
    const client = clientRef.current
    const expressions = watchExpressionsRef.current
    if (!client || expressions.length === 0) {
      setWatchResults([])
      return
    }
    const results = await Promise.all(
      expressions.map(async (expression): Promise<WatchResult> => {
        try {
          const value = await evaluateWithKnownBugFallback(client, expression, frameId ?? undefined, 'watch')
          return { expression, value, error: false }
        } catch (err) {
          return { expression, value: err instanceof Error ? err.message : 'evaluation failed', error: true }
        }
      }),
    )
    setWatchResults(results)
  }, [])

  const addWatch = useCallback(
    (expression: string) => {
      const trimmed = expression.trim()
      if (!trimmed) return
      setWatchExpressions((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
      // If already paused, evaluate right away instead of waiting for the next step/stopped event.
      if (statusRef.current === 'paused') {
        setTimeout(() => void evaluateWatches(topFrameIdRef.current), 0)
      }
    },
    [evaluateWatches],
  )

  const removeWatch = useCallback((expression: string) => {
    setWatchExpressions((prev) => prev.filter((e) => e !== expression))
    setWatchResults((prev) => prev.filter((w) => w.expression !== expression))
  }, [])

  /** Evaluate a one-off expression/statement in the debug console, DAP's 'repl' evaluate context.
   * Unlike Watch, this is a fire-once log entry, not a continuously re-evaluated value - and
   * netcoredbg's evaluator only supports read expressions (variable reads, method calls, property
   * access) - assignment, void calls and local declarations are NOT supported and will come back
   * as an error from the debugger, which we display as-is rather than trying to work around it. */
  const evaluateConsole = useCallback((expression: string) => {
    const trimmed = expression.trim()
    if (!trimmed) return
    const client = clientRef.current
    const id = ++consoleIdRef.current
    setConsoleHistory((prev) => [...prev, { id, expression: trimmed, result: null, error: false, pending: true }])

    if (!client || statusRef.current !== 'paused') {
      setConsoleHistory((prev) =>
        prev.map((e) => (e.id === id ? { ...e, pending: false, error: true, result: 'Program must be paused at a breakpoint to evaluate.' } : e)),
      )
      return
    }

    evaluateWithKnownBugFallback(client, trimmed, topFrameIdRef.current ?? undefined, 'repl')
      .then((value) => {
        setConsoleHistory((prev) => prev.map((e) => (e.id === id ? { ...e, pending: false, error: false, result: value } : e)))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setConsoleHistory((prev) => prev.map((e) => (e.id === id ? { ...e, pending: false, error: true, result: message } : e)))
      })
  }, [])

  const clearConsole = useCallback(() => {
    setConsoleHistory([])
  }, [])

  const toggleBreakpoint = useCallback((line: number) => {
    setBreakpointLines((prev) => (prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line].sort((a, b) => a - b)))
  }, [])

  const loadStackAndVariables = useCallback(
    async (threadId: number) => {
      const client = clientRef.current
      if (!client) return
      const stackResp = await client.request('stackTrace', { threadId, startFrame: 0, levels: 20 })
      const frames = ((stackResp.body as Record<string, unknown>)?.stackFrames as Array<Record<string, unknown>>) || []
      const mapped: StackFrame[] = frames.map((f) => ({
        id: f.id as number,
        name: f.name as string,
        line: f.line as number,
        column: f.column as number,
      }))
      setStackFrames(mapped)
      setCurrentLine(mapped[0]?.line ?? null)
      const topFrameId = mapped[0]?.id ?? null
      topFrameIdRef.current = topFrameId

      if (mapped.length === 0) {
        setVariables([])
        void evaluateWatches(null)
        return
      }

      const scopesResp = await client.request('scopes', { frameId: topFrameId })
      const scopes = ((scopesResp.body as Record<string, unknown>)?.scopes as Array<Record<string, unknown>>) || []
      const localsScope = scopes.find((s) => (s.name as string)?.toLowerCase() === 'locals') ?? scopes[0]
      if (!localsScope) {
        setVariables([])
      } else {
        const varsResp = await client.request('variables', { variablesReference: localsScope.variablesReference })
        const vars = ((varsResp.body as Record<string, unknown>)?.variables as Array<Record<string, unknown>>) || []
        setVariables(
          vars.map((v) => ({
            name: v.name as string,
            value: v.value as string,
            variablesReference: (v.variablesReference as number) ?? 0,
          })),
        )
      }

      void evaluateWatches(topFrameId)
    },
    [evaluateWatches],
  )

  const startDebugging = useCallback(
    async (code: string) => {
      setStatus('starting')
      setStatusMessage(null)
      setDebuggerOutput([])
      setStackFrames([])
      setVariables([])
      setCurrentLine(null)
      setConsoleHistory([])

      const client = new DapClient()
      clientRef.current = client

      client.on('stopped', (msg: DapMessage) => {
        const body = msg.body as Record<string, unknown>
        const threadId = body?.threadId as number
        threadIdRef.current = threadId
        setStatus('paused')
        setStatusMessage(`Stopped (${body?.reason ?? 'breakpoint'})`)
        void loadStackAndVariables(threadId)
      })
      client.on('continued', () => {
        setStatus('running')
        setStatusMessage(null)
        setStackFrames([])
        setVariables([])
        setCurrentLine(null)
        setWatchResults([])
        topFrameIdRef.current = null
      })
      client.on('terminated', () => {
        setStatus('terminated')
        setStatusMessage('Program finished.')
        setStackFrames([])
        setVariables([])
        setCurrentLine(null)
        setWatchResults([])
        topFrameIdRef.current = null
      })
      client.on('exited', (msg: DapMessage) => {
        const body = msg.body as Record<string, unknown>
        setStatusMessage(`Exited with code ${body?.exitCode ?? 0}`)
      })
      client.on('output', (msg: DapMessage) => {
        const body = msg.body as Record<string, unknown>
        const text = body?.output as string
        if (text) setDebuggerOutput((prev) => [...prev, text])
      })

      try {
        await client.connect()
        const { sourcePath } = await client.start(code)

        await client.request('initialize', {
          clientID: 'fiddle',
          adapterID: 'coreclr',
          linesStartAt1: true,
          columnsStartAt1: true,
          pathFormat: 'path',
        })

        // launch's program/cwd are filled in server-side by the WebSocket handler.
        const launchPromise = client.request('launch', { stopAtEntry: false })

        if (breakpointLines.length > 0) {
          await client.request('setBreakpoints', {
            source: { path: sourcePath },
            breakpoints: breakpointLines.map((line) => ({ line })),
          })
        }

        await client.request('configurationDone', {})
        await launchPromise
        setStatus('running')
      } catch (err) {
        setStatus('error')
        setStatusMessage(err instanceof Error ? err.message : 'Failed to start debug session')
      }
    },
    [breakpointLines, loadStackAndVariables],
  )

  const requireThread = () => {
    const id = threadIdRef.current
    if (id == null) throw new Error('No stopped thread to act on')
    return id
  }

  const continueExec = useCallback(async () => {
    const client = clientRef.current
    if (!client) return
    await client.request('continue', { threadId: requireThread() })
    setStatus('running')
  }, [])

  const stepOver = useCallback(async () => {
    await clientRef.current?.request('next', { threadId: requireThread() })
  }, [])

  const stepIn = useCallback(async () => {
    await clientRef.current?.request('stepIn', { threadId: requireThread() })
  }, [])

  const stepOut = useCallback(async () => {
    await clientRef.current?.request('stepOut', { threadId: requireThread() })
  }, [])

  const stopDebugging = useCallback(() => {
    clientRef.current?.stop()
    clientRef.current?.close()
    clientRef.current = null
    threadIdRef.current = null
    topFrameIdRef.current = null
    setStatus('idle')
    setStatusMessage(null)
    setStackFrames([])
    setVariables([])
    setCurrentLine(null)
    setWatchResults([])
  }, [])

  return {
    status,
    statusMessage,
    currentLine,
    stackFrames,
    variables,
    debuggerOutput,
    breakpointLines,
    watchExpressions,
    watchResults,
    addWatch,
    removeWatch,
    consoleHistory,
    evaluateConsole,
    clearConsole,
    toggleBreakpoint,
    startDebugging,
    continueExec,
    stepOver,
    stepIn,
    stepOut,
    stopDebugging,
  }
}
