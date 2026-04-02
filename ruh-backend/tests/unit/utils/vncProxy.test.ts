import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { SANDBOX_ID, makeSandboxRecord } from '../../helpers/fixtures';

// ── Mock store ──────────────────────────────────────────────────────────────

const mockGetSandbox = mock(async () => makeSandboxRecord());

mock.module('../../../src/store', () => ({
  getSandbox: mockGetSandbox,
  deleteSandbox: mock(async () => true),
  listSandboxes: mock(async () => []),
  saveSandbox: mock(async () => {}),
  markApproved: mock(async () => {}),
  updateSandboxSharedCodex: mock(async () => {}),
  initDb: mock(async () => {}),
}));

// Mock ws WebSocket to avoid real connections
const mockWsClose = mock(() => {});
const mockWsOn = mock(() => {});
const mockWsSend = mock(() => {});

class MockWebSocket {
  readyState = 1; // OPEN
  close = mockWsClose;
  on = mockWsOn;
  send = mockWsSend;
  static OPEN = 1;
  static CLOSED = 3;
}

const mockHandleUpgrade = mock((req: unknown, socket: unknown, head: unknown, cb: (ws: unknown) => void) => {
  cb(new MockWebSocket());
});

mock.module('ws', () => ({
  WebSocket: MockWebSocket,
  WebSocketServer: class {
    constructor() {}
    handleUpgrade = mockHandleUpgrade;
  },
}));

const { handleVncUpgrade } = await import('../../../src/vncProxy');

beforeEach(() => {
  mockGetSandbox.mockReset();
  mockGetSandbox.mockImplementation(async () => makeSandboxRecord());
  mockWsClose.mockReset();
  mockWsOn.mockReset();
  mockWsSend.mockReset();
  mockHandleUpgrade.mockReset();
  mockHandleUpgrade.mockImplementation(
    (req: unknown, socket: unknown, head: unknown, cb: (ws: unknown) => void) => {
      cb(new MockWebSocket());
    },
  );
});

// ── Helper ──────────────────────────────────────────────────────────────────

function makeIncomingMessage(url: string) {
  return {
    url,
    headers: { host: 'localhost' },
  } as any;
}

function makeDuplexSocket() {
  return {} as any;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('handleVncUpgrade', () => {
  test('ignores non-VNC paths', () => {
    handleVncUpgrade(
      makeIncomingMessage('/api/sandboxes/abc/chat'),
      makeDuplexSocket(),
      Buffer.alloc(0),
    );
    expect(mockHandleUpgrade).not.toHaveBeenCalled();
  });

  test('ignores root path', () => {
    handleVncUpgrade(
      makeIncomingMessage('/'),
      makeDuplexSocket(),
      Buffer.alloc(0),
    );
    expect(mockHandleUpgrade).not.toHaveBeenCalled();
  });

  test('ignores path without sandbox ID', () => {
    handleVncUpgrade(
      makeIncomingMessage('/api/sandboxes//vnc'),
      makeDuplexSocket(),
      Buffer.alloc(0),
    );
    // The regex requires at least one character for the sandbox ID segment
    expect(mockHandleUpgrade).not.toHaveBeenCalled();
  });

  test('extracts sandbox ID from valid VNC path', () => {
    handleVncUpgrade(
      makeIncomingMessage(`/api/sandboxes/${SANDBOX_ID}/vnc`),
      makeDuplexSocket(),
      Buffer.alloc(0),
    );
    expect(mockHandleUpgrade).toHaveBeenCalled();
  });
});

describe('proxyToContainer', () => {
  // proxyToContainer is called internally via handleUpgrade callback.
  // We test it by triggering handleVncUpgrade and checking the close behavior.

  test('closes with 4404 when sandbox not found', async () => {
    mockGetSandbox.mockImplementation(async () => null);

    const clientWs = new MockWebSocket();
    mockHandleUpgrade.mockImplementation(
      (_req: unknown, _socket: unknown, _head: unknown, cb: (ws: unknown) => void) => {
        cb(clientWs);
      },
    );

    handleVncUpgrade(
      makeIncomingMessage(`/api/sandboxes/${SANDBOX_ID}/vnc`),
      makeDuplexSocket(),
      Buffer.alloc(0),
    );

    // Wait for the async proxyToContainer to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(clientWs.close).toHaveBeenCalledWith(4404, 'Sandbox not found');
  });

  test('closes with 4503 when no vnc_port', async () => {
    mockGetSandbox.mockImplementation(async () => makeSandboxRecord({ vnc_port: null }));

    const clientWs = new MockWebSocket();
    mockHandleUpgrade.mockImplementation(
      (_req: unknown, _socket: unknown, _head: unknown, cb: (ws: unknown) => void) => {
        cb(clientWs);
      },
    );

    handleVncUpgrade(
      makeIncomingMessage(`/api/sandboxes/${SANDBOX_ID}/vnc`),
      makeDuplexSocket(),
      Buffer.alloc(0),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(clientWs.close).toHaveBeenCalledWith(4503, 'VNC not available for this sandbox');
  });

  test('closes with 4500 on database error', async () => {
    mockGetSandbox.mockImplementation(async () => {
      throw new Error('DB connection failed');
    });

    const clientWs = new MockWebSocket();
    mockHandleUpgrade.mockImplementation(
      (_req: unknown, _socket: unknown, _head: unknown, cb: (ws: unknown) => void) => {
        cb(clientWs);
      },
    );

    handleVncUpgrade(
      makeIncomingMessage(`/api/sandboxes/${SANDBOX_ID}/vnc`),
      makeDuplexSocket(),
      Buffer.alloc(0),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(clientWs.close).toHaveBeenCalledWith(4500, 'Database error');
  });
});
