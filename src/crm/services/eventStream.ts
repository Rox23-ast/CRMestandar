type EventListener = (event: string, data: unknown) => void;

const listeners = new Set<EventListener>();

export const subscribeToCrmEvents = (listener: EventListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishCrmEvent = (event: string, data: unknown) => {
  for (const listener of listeners) {
    listener(event, data);
  }
};
