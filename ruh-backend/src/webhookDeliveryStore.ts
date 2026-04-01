import { withConn } from './db';

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface ReserveWebhookDeliveryInput {
  publicId: string;
  deliveryId: string;
  agentId: string;
  triggerId: string;
}

export interface ReserveWebhookDeliveryResult {
  reserved: boolean;
  existingStatus: WebhookDeliveryStatus | null;
}

const WEBHOOK_DELIVERY_RETENTION_INTERVAL = '7 days';

export async function reserveWebhookDelivery(
  input: ReserveWebhookDeliveryInput,
): Promise<ReserveWebhookDeliveryResult> {
  return withConn(async (client) => {
    await client.query(
      `DELETE FROM webhook_delivery_dedupes
       WHERE updated_at < NOW() - INTERVAL '${WEBHOOK_DELIVERY_RETENTION_INTERVAL}'`,
    );

    const insert = await client.query(
      `INSERT INTO webhook_delivery_dedupes (
         public_id,
         delivery_id,
         agent_id,
         trigger_id,
         status
       )
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (public_id, delivery_id) DO NOTHING
       RETURNING status`,
      [input.publicId, input.deliveryId, input.agentId, input.triggerId],
    );

    if ((insert.rowCount ?? 0) > 0) {
      return { reserved: true, existingStatus: null };
    }

    const existing = await client.query(
      `SELECT status
       FROM webhook_delivery_dedupes
       WHERE public_id = $1 AND delivery_id = $2`,
      [input.publicId, input.deliveryId],
    );

    const existingStatus = existing.rows[0]?.status;
    return {
      reserved: false,
      existingStatus:
        existingStatus === 'pending' || existingStatus === 'delivered' || existingStatus === 'failed'
          ? existingStatus
          : null,
    };
  });
}

export async function markWebhookDeliveryStatus(
  publicId: string,
  deliveryId: string,
  status: WebhookDeliveryStatus,
): Promise<void> {
  await withConn(async (client) => {
    await client.query(
      `UPDATE webhook_delivery_dedupes
       SET status = $3,
           updated_at = NOW()
       WHERE public_id = $1 AND delivery_id = $2`,
      [publicId, deliveryId, status],
    );
  });
}
