import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

/** One request drawn on a lane. */
interface Marble {
  /** Start of the request, in scenario ms. */
  start: number;
  /** Settle time, in scenario ms. */
  end: number;
  /** 1-based call number, or null for a call that never ran. */
  label: number | null;
  outcome: 'settled' | 'cancelled' | 'ignored';
  /** Vertical lane, so overlapping requests stay legible. */
  lane: number;
}

export type StrategyKey = 'merge' | 'concat' | 'switch' | 'exhaust';

export interface Strategy {
  key: StrategyKey;
  operator: string;
  summary: string;
}

export const STRATEGIES: readonly Strategy[] = [
  { key: 'merge', operator: 'mergeMap', summary: 'Every call runs, in parallel.' },
  { key: 'concat', operator: 'concatMap', summary: 'Queued, and kept in order.' },
  { key: 'switch', operator: 'switchMap', summary: 'Latest wins, earlier discarded.' },
  { key: 'exhaust', operator: 'exhaustMap', summary: 'First wins, the rest ignored.' },
];

const CALLS = 5;
/**
 * Request duration and inter-call gap, in scenario ms. Chosen so that every
 * lane shares one honest time axis while still spacing marbles far enough
 * apart to stay legible: `concat` sets the total span at CALLS * DURATION,
 * and GAP as a fraction of that span must exceed a marble's width.
 */
const DURATION = 900;
const GAP = 300;

/**
 * Resolves what a strategy actually does with `CALLS` rapid `mutate()` calls.
 * This mirrors the real semantics in create-mutation.ts, so the picture can't
 * drift from the implementation.
 */
export function schedule(strategy: StrategyKey): Marble[] {
  const out: Marble[] = [];

  switch (strategy) {
    case 'merge':
      for (let i = 0; i < CALLS; i++) {
        out.push({ start: i * GAP, end: i * GAP + DURATION, label: i + 1, outcome: 'settled', lane: i });
      }
      break;

    case 'concat':
      for (let i = 0; i < CALLS; i++) {
        out.push({ start: i * DURATION, end: (i + 1) * DURATION, label: i + 1, outcome: 'settled', lane: 0 });
      }
      break;

    case 'switch':
      // One lane per attempt. Cancelled requests land close together on the
      // time axis, so stacking them is what keeps the crosses readable.
      for (let i = 0; i < CALLS; i++) {
        const isLast = i === CALLS - 1;
        out.push({
          start: i * GAP,
          end: isLast ? i * GAP + DURATION : (i + 1) * GAP,
          label: i + 1,
          outcome: isLast ? 'settled' : 'cancelled',
          lane: i,
        });
      }
      break;

    case 'exhaust':
      out.push({ start: 0, end: DURATION, label: 1, outcome: 'settled', lane: 0 });
      // Lane 2 keeps the ignored markers clear of the running request's marble,
      // which sits at roughly the same point on the x axis.
      for (let i = 1; i < CALLS; i++) {
        out.push({ start: i * GAP, end: i * GAP, label: null, outcome: 'ignored', lane: 2 });
      }
      break;
  }

  return out;
}

/** Total scenario length, used to normalise every lane to the same time axis. */
const SPAN = CALLS * DURATION;

@Component({
  selector: 'app-marble-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'diagram' },
  styleUrl: './marble-diagram.css',
  template: `
    <!-- Shared playhead. Makes it obvious that every lane is drawn on one
         time axis, so a lane ending early reads as "finished", not "cut off". -->
    <span class="playhead" aria-hidden="true" [style.--head]="playheadFraction()"></span>

    <div class="row source">
      <span class="rail">mutate()</span>
      <div class="track">
        <span class="axis"></span>
        @for (tick of ticks; track tick) {
          <span
            class="tick"
            [class.fired]="elapsed() >= tick"
            [style.left.%]="pct(tick)"
          ></span>
        }
      </div>
    </div>

    @for (s of strategies(); track s.key) {
      <div class="row lane-row">
        <span class="rail">
          <code>'{{ s.key }}'</code>
          <em>{{ s.operator }}</em>
        </span>
        <div class="track">
          <span class="axis"></span>
          @for (m of schedules()[s.key]; track $index) {
            @if (elapsed() >= m.start) {
              <span
                class="bar"
                [class.dim]="m.outcome !== 'settled'"
                [style.left.%]="pct(m.start)"
                [style.width.%]="pct(visibleEnd(m) - m.start)"
                [style.top.px]="laneTop(m.lane)"
              ></span>
            }
            @if (elapsed() >= m.end) {
              <span
                class="marble"
                [class.cancelled]="m.outcome === 'cancelled'"
                [class.ignored]="m.outcome === 'ignored'"
                [style.left.%]="pct(m.end)"
                [style.top.px]="laneTop(m.lane)"
                >{{ glyph(m) }}</span
              >
            }
          }
        </div>
      </div>
    }
  `,
})
export class MarbleDiagram {
  /** Which strategies to draw. Defaults to all four. */
  readonly strategies = input<readonly Strategy[]>(STRATEGIES);

  /** Playback head, in scenario ms. */
  private readonly clock = signal(0);
  readonly elapsed = this.clock.asReadonly();

  protected readonly ticks = Array.from({ length: CALLS }, (_, i) => i * GAP);

  protected readonly schedules = computed(() => {
    const map = {} as Record<StrategyKey, Marble[]>;
    for (const s of this.strategies()) map[s.key] = schedule(s.key);
    return map;
  });

  private frame = 0;
  private startedAt = 0;

  constructor() {
    // Guarded: neither rAF nor cAF exists during prerendering.
    inject(DestroyRef).onDestroy(() => {
      if (this.frame && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.frame);
      }
    });

    // Respect the OS reduced-motion setting: show the finished state instead
    // of animating toward it.
    const still =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (still) {
      this.clock.set(SPAN);
      return;
    }

    // Only animate in the browser — during prerender there is no rAF and the
    // static output should already show the completed diagram.
    if (typeof requestAnimationFrame === 'function') {
      this.loop();
    } else {
      this.clock.set(SPAN);
    }
  }

  private loop = () => {
    const now = performance.now();
    if (!this.startedAt) this.startedAt = now;

    // 1.6x real time keeps the loop watchable without feeling rushed,
    // then holds on the finished state before repeating.
    const t = (now - this.startedAt) * 1.6;
    if (t > SPAN + 1800) {
      this.startedAt = now;
      this.clock.set(0);
    } else {
      this.clock.set(Math.min(t, SPAN));
    }

    this.frame = requestAnimationFrame(this.loop);
  };

  /** Position along the shared time axis, as a percentage. */
  protected pct(ms: number): number {
    return (ms / SPAN) * 100;
  }

  /**
   * Playhead offset as a 0–1 fraction. The rail column is a fixed width, so CSS
   * resolves the actual position with calc() against the track, not the host.
   */
  protected readonly playheadFraction = computed(() => this.elapsed() / SPAN);

  /** Grow the bar with the clock so requests visibly run rather than appear. */
  protected visibleEnd(m: Marble): number {
    return Math.min(m.end, Math.max(m.start, this.elapsed()));
  }

  protected laneTop(lane: number): number {
    return lane * 13;
  }

  /**
   * What to draw inside a marble: the call number when it settled, a cross when
   * it was cancelled mid-flight, and nothing for a call that never ran.
   */
  protected glyph(m: Marble): string {
    if (m.outcome === 'cancelled') return '×';
    if (m.outcome === 'ignored') return '';
    return String(m.label ?? '');
  }
}
