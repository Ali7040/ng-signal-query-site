import { StrategyKey } from '../marble-diagram/marble-diagram';

export interface Request {
  /** When the caller invoked mutate(), in ms. */
  called: number;
  /** When the request actually started — later than `called` under concat. */
  start: number;
  /** When it settled, was cancelled, or was dropped. */
  end: number;
  /** 1-based call number. */
  label: number;
  outcome: 'settled' | 'cancelled' | 'ignored';
  lane: number;
}

/**
 * Resolves an arbitrary sequence of `mutate()` calls under one strategy.
 *
 * This is the semantics from create-mutation.ts, generalised to any call times
 * so the playground can be driven by the user rather than a fixed script:
 *
 *  - merge   every call runs immediately, all in parallel
 *  - concat  a call waits for the previous one to settle, preserving order
 *  - switch  a new call supersedes the one in flight, which is discarded
 *  - exhaust a call is dropped entirely while another is running
 */
export function simulate(
  strategy: StrategyKey,
  calls: readonly number[],
  duration: number,
): Request[] {
  const sorted = [...calls].sort((a, b) => a - b);
  const out: Request[] = [];

  switch (strategy) {
    case 'merge':
      sorted.forEach((t, i) => {
        out.push({ called: t, start: t, end: t + duration, label: i + 1, outcome: 'settled', lane: i });
      });
      break;

    case 'concat': {
      // Each request begins only once the queue ahead of it has drained.
      let freeAt = 0;
      sorted.forEach((t, i) => {
        const start = Math.max(t, freeAt);
        const end = start + duration;
        freeAt = end;
        out.push({ called: t, start, end, label: i + 1, outcome: 'settled', lane: 0 });
      });
      break;
    }

    case 'switch':
      sorted.forEach((t, i) => {
        const next = sorted[i + 1];
        const settlesAt = t + duration;
        // Superseded before it could finish → discarded at the moment the
        // newer call arrives.
        const cancelled = next !== undefined && next < settlesAt;
        out.push({
          called: t,
          start: t,
          end: cancelled ? next : settlesAt,
          label: i + 1,
          outcome: cancelled ? 'cancelled' : 'settled',
          lane: i,
        });
      });
      break;

    case 'exhaust': {
      let busyUntil = Number.NEGATIVE_INFINITY;
      let lane = 0;
      sorted.forEach((t, i) => {
        if (t >= busyUntil) {
          busyUntil = t + duration;
          out.push({ called: t, start: t, end: t + duration, label: i + 1, outcome: 'settled', lane });
          lane = 0;
        } else {
          // Never ran: no request, just a dropped call.
          out.push({ called: t, start: t, end: t, label: i + 1, outcome: 'ignored', lane: 2 });
        }
      });
      break;
    }
  }

  return out;
}

/** How many calls actually reached the server under this strategy. */
export function requestCount(reqs: readonly Request[]): number {
  return reqs.filter((r) => r.outcome !== 'ignored').length;
}

/** How many produced a result the app would act on. */
export function settledCount(reqs: readonly Request[]): number {
  return reqs.filter((r) => r.outcome === 'settled').length;
}
