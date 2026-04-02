"use client";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_HERMES_API || "http://localhost:8100";

export interface HermesEvent {
  type: "task" | "memory" | "score" | "refinement" | "session";
  action: "created" | "updated";
  data: any;
}

export function useEventStream(onEvent?: (event: HermesEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<HermesEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource(`${API}/api/events/stream`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const event: HermesEvent = JSON.parse(e.data);
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => { es.close(); setConnected(false); };
  }, []);

  return { connected, lastEvent };
}
