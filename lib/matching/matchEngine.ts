import type { MusicProviderId } from '@/lib/music-provider/types';
import type { TrackPayload } from '@/hooks/dnd/types';
import { createProviderMatchingAdapter, type MatchCandidate, type ProviderMatchingAdapter } from './providers';
import { getConfiguredMatchThresholds } from './config';

export interface MatchEngineTask {
  pendingId: string;
  payload: TrackPayload;
  targetProvider: MusicProviderId;
  onMatched: (candidate: MatchCandidate) => Promise<void> | void;
  onNeedsManualCheck: (candidate: MatchCandidate, candidates: MatchCandidate[]) => void;
  onUnresolved: (reason: string, candidates?: MatchCandidate[]) => void;
  onError: (error: unknown) => void;
}

interface QueuedTask extends MatchEngineTask {
  attempts: number;
}

class MatchEngine {
  private readonly adapter: ProviderMatchingAdapter;
  private readonly queue: QueuedTask[] = [];
  private readonly active = new Set<string>();
  private readonly cancelled = new Set<string>();
  private readonly maxConcurrency = 3;

  constructor(adapter: ProviderMatchingAdapter) {
    this.adapter = adapter;
  }

  enqueue(task: MatchEngineTask): void {
    this.cancelled.delete(task.pendingId);
    this.queue.push({ ...task, attempts: 0 });
    void this.pump();
  }

  cancel(pendingId: string): void {
    this.cancelled.add(pendingId);
  }

  private async pump(): Promise<void> {
    while (this.active.size < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next || this.cancelled.has(next.pendingId)) {
        continue;
      }

      this.active.add(next.pendingId);
      void this.runTask(next).finally(() => {
        this.active.delete(next.pendingId);
        void this.pump();
      });
    }
  }

  private async runTask(task: QueuedTask): Promise<void> {
    try {
      const thresholds = getConfiguredMatchThresholds();
      const candidates = await this.adapter.searchCandidates(task.payload, task.targetProvider, 3);
      const candidate = candidates[0] ?? null;

      if (this.cancelled.has(task.pendingId)) {
        return;
      }

      if (!candidate) {
        task.onUnresolved('No candidate found', candidates);
        return;
      }

      if (candidate.score >= thresholds.convert) {
        await task.onMatched(candidate);
        return;
      }

      if (candidate.score >= thresholds.manual) {
        task.onNeedsManualCheck(candidate, candidates);
        return;
      }

      task.onUnresolved(`Low confidence (${candidate.score.toFixed(2)})`, candidates);
    } catch (error) {
      if (task.attempts < 2) {
        const retryDelayMs = 400 * 2 ** task.attempts;
        setTimeout(() => {
          if (this.cancelled.has(task.pendingId)) {
            return;
          }

          this.queue.push({ ...task, attempts: task.attempts + 1 });
          void this.pump();
        }, retryDelayMs);
        return;
      }

      task.onError(error);
      task.onUnresolved('Match failed');
    }
  }
}

let singleton: MatchEngine | null = null;

export function getMatchEngine(): MatchEngine {
  if (!singleton) {
    singleton = new MatchEngine(createProviderMatchingAdapter());
  }

  return singleton;
}
