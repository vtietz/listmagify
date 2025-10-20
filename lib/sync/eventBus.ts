/**
 * Lightweight event bus for cross-panel playlist synchronization.
 * Enables panels showing the same playlist to stay in sync across mutations and reloads.
 */

type EventMap = {
  'playlist:update': { playlistId: string; cause: 'reorder' | 'add' | 'remove' };
  'playlist:reload': { playlistId: string };
};

type EventCallback<T> = (data: T) => void;

class EventBus {
  private listeners: Map<keyof EventMap, Set<EventCallback<unknown>>> = new Map();

  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
    };
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Singleton instance
export const eventBus = new EventBus();
