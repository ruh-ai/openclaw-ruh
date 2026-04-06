export type EventType = 'task' | 'memory' | 'score' | 'refinement' | 'session';
export type EventAction = 'created' | 'updated';

export interface BusEvent {
  type: EventType;
  action: EventAction;
  data: unknown;
}

type Subscriber = (event: BusEvent) => void;

const subscribers = new Set<Subscriber>();

export function subscribe(callback: Subscriber): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function publish(event: BusEvent): void {
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch {
      // individual subscriber failures must not break others
    }
  }
}

export function clientCount(): number {
  return subscribers.size;
}
