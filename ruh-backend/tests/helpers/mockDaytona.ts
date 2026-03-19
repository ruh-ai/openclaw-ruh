/**
 * Factories for mock Daytona SDK objects.
 * Used by unit and E2E tests to avoid real network calls.
 */

export interface MockExecResult {
  exitCode: number;
  result: string;
}

export class MockProcess {
  calls: string[] = [];
  private queue: MockExecResult[] = [];
  defaultResult: MockExecResult = { exitCode: 0, result: '' };

  /**
   * Optional per-command matcher. If set, called for every executeCommand invocation
   * after the queue is exhausted. Return undefined to fall through to defaultResult.
   */
  commandMatcher?: (cmd: string) => MockExecResult | undefined;

  /** Queue a specific response for the next executeCommand call. */
  queueResponse(r: MockExecResult): this {
    this.queue.push(r);
    return this;
  }

  async executeCommand(cmd: string, _cwd?: string, _env?: Record<string, string>, _timeout?: number): Promise<MockExecResult> {
    this.calls.push(cmd);
    return this.queue.shift() ?? this.commandMatcher?.(cmd) ?? { ...this.defaultResult };
  }
}

export interface MockSandbox {
  id: string;
  instance: { state: string };
  process: MockProcess;
  getPreviewLink: (port: number) => string;
}

export function makeMockSandbox(id = 'mock-sb-001'): MockSandbox {
  return {
    id,
    instance: { state: 'started' },
    process: new MockProcess(),
    getPreviewLink: (port: number) => `https://preview.daytona.io/${id}-${port}`,
  };
}

export function makeMockDaytona(sandbox: MockSandbox) {
  return {
    create: async () => sandbox,
    get: async (_id: string) => sandbox,
    list: async () => [sandbox],
  };
}
