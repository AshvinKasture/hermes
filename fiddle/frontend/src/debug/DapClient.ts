/** Minimal client for the DAP-over-WebSocket bridge exposed at /fiddle/api/debug.
 *
 * Wire protocol (see backend/DebugWebSocketHandler.cs):
 *   -> { kind: 'start', code }             compile (Debug config) + launch netcoredbg
 *   <- { kind: 'started', sourcePath }      session ready, send DAP requests now
 *   <- { kind: 'compileError', error }      compilation failed, no session started
 *   -> { kind: 'dap', message }             a raw DAP request
 *   <- a raw DAP response/event object (no 'kind' wrapper - matches the DAP spec shape)
 *   -> { kind: 'stop' }                     kill the session
 *   <- { kind: 'stopped' }
 *
 * This class turns that into a promise-based request/response API (matching DAP's
 * `request_seq`) plus a plain event-subscription API for async DAP events (stopped,
 * output, terminated, breakpoint, ...).
 */

export type DapMessage = Record<string, unknown>

type PendingRequest = {
  resolve: (msg: DapMessage) => void
  reject: (err: Error) => void
}

export class DapClient {
  private ws: WebSocket | null = null
  private seq = 0
  private pending = new Map<number, PendingRequest>()
  private eventHandlers = new Map<string, Set<(msg: DapMessage) => void>>()
  private controlHandlers = new Map<string, Set<(msg: DapMessage) => void>>()

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${window.location.host}/fiddle/api/debug`)
      this.ws = ws
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('WebSocket connection failed'))
      ws.onmessage = (ev) => this.handleMessage(ev.data)
      ws.onclose = () => {
        for (const { reject: rej } of this.pending.values()) rej(new Error('Connection closed'))
        this.pending.clear()
        this.emitControl('closed', {})
      }
    })
  }

  private handleMessage(raw: string) {
    let msg: DapMessage
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    const kind = msg.kind as string | undefined
    if (kind === 'started' || kind === 'compileError' || kind === 'stopped' || kind === 'debuggerLog') {
      this.emitControl(kind, msg)
      return
    }

    // Raw DAP response or event.
    if (msg.type === 'response') {
      const reqSeq = msg.request_seq as number
      const pending = this.pending.get(reqSeq)
      if (pending) {
        this.pending.delete(reqSeq)
        if (msg.success) pending.resolve(msg)
        else pending.reject(new Error((msg.message as string) || 'DAP request failed'))
      }
      return
    }

    if (msg.type === 'event') {
      const eventName = msg.event as string
      this.emit(eventName, msg)
    }
  }

  /** Compile + launch a debug session for the given source. Resolves once 'started' or rejects on compileError. */
  start(code: string): Promise<{ sourcePath: string }> {
    return new Promise((resolve, reject) => {
      const onStarted = (msg: DapMessage) => {
        this.offControl('started', onStarted)
        this.offControl('compileError', onError)
        resolve({ sourcePath: msg.sourcePath as string })
      }
      const onError = (msg: DapMessage) => {
        this.offControl('started', onStarted)
        this.offControl('compileError', onError)
        reject(new Error((msg.error as string) || 'Compilation failed'))
      }
      this.onControl('started', onStarted)
      this.onControl('compileError', onError)
      this.ws?.send(JSON.stringify({ kind: 'start', code }))
    })
  }

  stop() {
    try {
      this.ws?.send(JSON.stringify({ kind: 'stop' }))
    } catch {
      /* already closed */
    }
  }

  close() {
    this.ws?.close()
    this.ws = null
  }

  /** Send a DAP request and resolve with its response body once it arrives. */
  request(command: string, args: Record<string, unknown> = {}): Promise<DapMessage> {
    const seq = ++this.seq
    const message = { seq, type: 'request', command, arguments: args }
    return new Promise((resolve, reject) => {
      this.pending.set(seq, { resolve, reject })
      this.ws?.send(JSON.stringify({ kind: 'dap', message }))
      setTimeout(() => {
        if (this.pending.has(seq)) {
          this.pending.delete(seq)
          reject(new Error(`DAP request '${command}' timed out`))
        }
      }, 15_000)
    })
  }

  on(event: string, handler: (msg: DapMessage) => void) {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, new Set())
    this.eventHandlers.get(event)!.add(handler)
  }

  off(event: string, handler: (msg: DapMessage) => void) {
    this.eventHandlers.get(event)?.delete(handler)
  }

  private emit(event: string, msg: DapMessage) {
    this.eventHandlers.get(event)?.forEach((h) => h(msg))
  }

  private onControl(kind: string, handler: (msg: DapMessage) => void) {
    if (!this.controlHandlers.has(kind)) this.controlHandlers.set(kind, new Set())
    this.controlHandlers.get(kind)!.add(handler)
  }

  private offControl(kind: string, handler: (msg: DapMessage) => void) {
    this.controlHandlers.get(kind)?.delete(handler)
  }

  private emitControl(kind: string, msg: DapMessage) {
    this.controlHandlers.get(kind)?.forEach((h) => h(msg))
  }
}
