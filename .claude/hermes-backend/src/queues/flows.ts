import { FlowProducer } from 'bullmq';
import { getRedis } from '../redis';

let flowProducer: FlowProducer | null = null;

export function getFlowProducer(): FlowProducer {
  if (!flowProducer) {
    flowProducer = new FlowProducer({ connection: getRedis() });
  }
  return flowProducer;
}

export async function closeFlowProducer(): Promise<void> {
  if (flowProducer) {
    await flowProducer.close();
    flowProducer = null;
  }
}
