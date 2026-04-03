/**
 * Conversation management routes — extracted from app.ts.
 *
 * Handles CRUD for sandbox conversations and their messages.
 */

import { Router } from 'express';
import * as conversationStore from './conversationStore';
import { getSandboxConversationRecord } from './conversationAccess';
import { validateConversationMessagesAppendBody } from './validation';
import { httpError } from './utils';
import {
  asyncHandler,
  getRecord,
  parsePositiveIntParam,
  type RouteContext,
} from './routeHelpers';

export function createConversationRouter(ctx: RouteContext): Router {
  const router = Router({ mergeParams: true });

  // List conversations for a sandbox
  router.get('/api/sandboxes/:sandbox_id/conversations', asyncHandler(async (req, res) => {
    await getRecord(req.params.sandbox_id);
    const limit = Math.min(parsePositiveIntParam(req.query.limit, 20, 'conversation limit'), 100);
    const cursor = req.query.cursor == null ? null : String(req.query.cursor);

    try {
      res.json(await conversationStore.listConversationsPage(req.params.sandbox_id, { limit, cursor }));
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid conversation cursor') {
        throw httpError(400, 'Invalid conversation cursor');
      }
      throw error;
    }
  }));

  // Create a new conversation
  router.post('/api/sandboxes/:sandbox_id/conversations', asyncHandler(async (req, res) => {
    await getRecord(req.params.sandbox_id);
    const conv = await conversationStore.createConversation(
      req.params.sandbox_id,
      req.body.model ?? 'openclaw-default',
      req.body.name ?? 'New Conversation',
    );
    // Create session folder with context file (fire-and-forget — non-fatal if sandbox is down)
    ctx.sandboxExec(
      req.params.sandbox_id,
      `mkdir -p "$HOME/.openclaw/workspace/sessions/${conv.id}" 2>/dev/null && ` +
      `printf '%s' 'This is your session workspace. All output files for this conversation should be created here.' ` +
      `> "$HOME/.openclaw/workspace/sessions/${conv.id}/.session-context" 2>/dev/null`,
      10,
    ).catch(() => { /* sandbox may be stopped — folder will be created on first file write */ });
    res.json(conv);
  }));

  // Get paginated messages for a conversation
  router.get('/api/sandboxes/:sandbox_id/conversations/:conv_id/messages', asyncHandler(async (req, res) => {
    const { sandbox_id, conv_id } = req.params;
    await getSandboxConversationRecord(sandbox_id, conv_id);
    const limit = Math.min(parsePositiveIntParam(req.query.limit, 50, 'message limit'), 200);
    const beforeValue = req.query.before;
    let before: number | null = null;
    if (beforeValue != null && beforeValue !== '') {
      before = parsePositiveIntParam(beforeValue, 0, 'message cursor');
    }

    res.json(await conversationStore.getMessagesPage(conv_id, { limit, before }));
  }));

  // Append messages to a conversation
  router.post('/api/sandboxes/:sandbox_id/conversations/:conv_id/messages', asyncHandler(async (req, res) => {
    const { sandbox_id, conv_id } = req.params;
    await getSandboxConversationRecord(sandbox_id, conv_id);
    const body = validateConversationMessagesAppendBody(req.body);
    await conversationStore.appendMessages(conv_id, body.messages);
    res.json({ ok: true });
  }));

  // Rename a conversation
  router.patch('/api/sandboxes/:sandbox_id/conversations/:conv_id', asyncHandler(async (req, res) => {
    const { sandbox_id, conv_id } = req.params;
    await getSandboxConversationRecord(sandbox_id, conv_id);
    await conversationStore.renameConversation(conv_id, req.body.name);
    res.json({ ok: true });
  }));

  // Delete a conversation
  router.delete('/api/sandboxes/:sandbox_id/conversations/:conv_id', asyncHandler(async (req, res) => {
    const { sandbox_id, conv_id } = req.params;
    await getSandboxConversationRecord(sandbox_id, conv_id);
    await conversationStore.deleteConversation(conv_id);
    res.json({ deleted: conv_id });
  }));

  return router;
}
