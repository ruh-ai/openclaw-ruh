import * as store from './store';
import * as conversationStore from './conversationStore';
import { httpError } from './utils';

export async function getSandboxConversationRecord(
  sandboxId: string,
  conversationId: string,
): Promise<conversationStore.ConversationRecord> {
  const sandbox = await store.getSandbox(sandboxId);
  if (!sandbox) {
    throw httpError(404, 'Sandbox not found');
  }

  const conversation = await conversationStore.getConversationForSandbox(conversationId, sandboxId);
  if (!conversation) {
    throw httpError(404, 'Conversation not found');
  }

  return conversation;
}
