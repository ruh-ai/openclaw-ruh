/**
 * Web API polyfills for jest-environment-jsdom.
 * Must use require() (not import) so we control execution order:
 * TextDecoder must be set globally BEFORE undici is loaded.
 */

// 1. Text codecs (needed by undici internals)
const { TextDecoder, TextEncoder } = require('util');
Object.assign(globalThis, { TextDecoder, TextEncoder });

// 2. Streams (needed by undici internals and MSW sse.ts)
const { ReadableStream, TransformStream, WritableStream } = require('stream/web');
Object.assign(globalThis, { ReadableStream, TransformStream, WritableStream });

// 3. Worker threads (needed by undici webidl)
const { MessageChannel, MessagePort } = require('worker_threads');
Object.assign(globalThis, { MessageChannel, MessagePort });

// 4. Now undici can load safely
const { fetch, Headers, FormData, Request, Response } = require('undici');
const { Blob, File } = require('buffer');
Object.assign(globalThis, { Blob, File, fetch, Headers, FormData, Request, Response });

// 5. BroadcastChannel (needed by MSW v2's ws.ts)
const { BroadcastChannel } = require('worker_threads');
Object.assign(globalThis, { BroadcastChannel });
