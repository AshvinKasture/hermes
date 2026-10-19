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

export type DebugStatus = 'idle' | 'starting' | 'running' | 'paused' | 'terminated' | 'error'

export interface UseDebuggerResult {
  status: DebugStatus
  statusMessage: string | null
  currentLine: number | null
  stackFrames: StackFrame[]
  variables: Variable[]
  debuggerOutput: string[]
  breakpointLines: number[]
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

  const clientRef = useRef<DapClient | null>(null)
  const threadIdRef = useRef<number | null>(null)

  const toggleBreakpoint = useCallback((line: number) => {
    setBreakpointLines((prev) => (prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line].sort((a, b) => a - b)))
  }, [])

  const loadStackAndVariables = useCallback(async (threadId: number) => {
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

    if (mapped.length === 0) {
      setVariables([])
      return
    }

    const scopesResp = await client.request('scopes', { frameId: mapped[0].id })
    const scopes = ((scopesResp.body as Record<string, unknown>)?.scopes as Array<Record<string, unknown>>) || []
    const localsScope = scopes.find((s) => (s.name as string)?.toLowerCase() === 'locals') ?? scopes[0]
    if (!localsScope) {
      setVariables([])
      return
    }

    const varsResp = await client.request('variables', { variablesReference: localsScope.variablesReference })
    const vars = ((varsResp.body as Record<string, unknown>)?.variables as Array<Record<string, unknown>>) || []
    setVariables(
      vars.map((v) => ({
        name: v.name as string,
        value: v.value as string,
        variablesReference: (v.variablesReference as number) ?? 0,
      })),
    )
  }, [])

  const startDebugging = useCallback(
    async (code: string) => {
      setStatus('starting')
      setStatusMessage(null)
      setDebuggerOutput([])
      setStackFrames([])
      setVariables([])
      setCurrentLine(null)

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
      })
      client.on('terminated', () => {
        setStatus('terminated')
        setStatusMessage('Program finished.')
        setStackFrames([])
        setVariables([])
        setCurrentLine(null)
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
    setStatus('idle')
    setStatusMessage(null)
    setStackFrames([])
    setVariables([])
    setCurrentLine(null)
  }, [])

  return {
    status,
    statusMessage,
    currentLine,
    stackFrames,
    variables,
    debuggerOutput,
    breakpointLines,
    toggleBreakpoint,
    startDebugging,
    continueExec,
    stepOver,
    stepIn,
    stepOut,
    stopDebugging,
  }
}
