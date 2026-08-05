import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { STRATEGIES, StrategyKey } from '../marble-diagram/marble-diagram';
import { Request, requestCount, settledCount, simulate } from './simulate';

/** Width of the scenario window, in ms. */
const SPAN = 6000;
const DEFAULT_CALLS = [200, 700, 1100, 1600, 3400];

@Component({
  selector: 'app-playground',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './playground.css',
  template: `
    <div class="panel">
      <!-- ── controls ─────────────────────────────────────────────────── -->
      <div class="controls">
        <div class="picker" role="group" aria-label="Concurrency strategy">
          @for (s of strategies; track s.key) {
            <button
              type="button"
              [class.on]="strategy() === s.key"
              (click)="strategy.set(s.key)"
            >
              '{{ s.key }}'
            </button>
          }
        </div>

        <div class="knobs">
          <label>
            <span class="eyebrow">Request takes</span>
            <input
              type="range"
              min="400"
              max="2400"
              step="100"
              [value]="duration()"
              (input)="setDuration($event)"
              aria-label="Request duration in milliseconds"
            />
            <output>{{ duration() }}ms</output>
          </label>
          <button type="button" class="reset" (click)="reset()">Reset</button>
        </div>
      </div>

      <!-- ── source track: click to add a call ────────────────────────── -->
      <div class="row">
        <span class="rail">
          mutate()
          <em>click the line to add a call</em>
        </span>
        <div
          class="track clickable"
          role="button"
          tabindex="0"
          aria-label="Add a mutate call at this point in time"
          (click)="addCall($event)"
          (keydown.enter)="addCall(null)"
        >
          <span class="axis"></span>
          @for (t of calls(); track t) {
            <button
              type="button"
              class="tick"
              [style.left.%]="pct(t)"
              [attr.aria-label]="'Remove call at ' + t + 'ms'"
              (click)="removeCall(t, $event)"
            ></button>
          }
          @if (!calls().length) {
            <span class="empty">no calls yet — click anywhere on this line</span>
          }
        </div>
      </div>

      <!-- ── result ───────────────────────────────────────────────────── -->
      <div class="row result">
        <span class="rail">
          <code>'{{ strategy() }}'</code>
          <em>{{ operatorFor(strategy()) }}</em>
        </span>
        <div class="track">
          <span class="axis"></span>
          @for (r of requests(); track r.label) {
            @if (r.outcome !== 'ignored') {
              <span
                class="bar"
                [class.dim]="r.outcome === 'cancelled'"
                [style.left.%]="pct(r.start)"
                [style.width.%]="pct(r.end - r.start)"
                [style.top.px]="r.lane * 14"
              ></span>
              <!-- Under concat a call can wait before it starts; show the wait. -->
              @if (r.start > r.called) {
                <span
                  class="wait"
                  [style.left.%]="pct(r.called)"
                  [style.width.%]="pct(r.start - r.called)"
                  [style.top.px]="r.lane * 14"
                ></span>
              }
            }
            <span
              class="marble"
              [class.cancelled]="r.outcome === 'cancelled'"
              [class.ignored]="r.outcome === 'ignored'"
              [style.left.%]="pct(r.end)"
              [style.top.px]="r.lane * 14"
              >{{ glyph(r) }}</span
            >
          }
        </div>
      </div>

      <!-- ── readout ──────────────────────────────────────────────────── -->
      <div class="readout">
        <span><b>{{ calls().length }}</b> calls</span>
        <span><b>{{ sent() }}</b> reached the server</span>
        <span><b>{{ settled() }}</b> produced a result</span>
        <span class="note">{{ verdict() }}</span>
      </div>

      <pre class="snippet"><code>{{ snippet() }}</code></pre>
    </div>
  `,
})
export class Playground {
  protected readonly strategies = STRATEGIES;

  readonly strategy = signal<StrategyKey>('exhaust');
  readonly duration = signal(1200);
  readonly calls = signal<number[]>([...DEFAULT_CALLS]);

  protected readonly requests = computed<Request[]>(() =>
    simulate(this.strategy(), this.calls(), this.duration()),
  );

  protected readonly sent = computed(() => requestCount(this.requests()));
  protected readonly settled = computed(() => settledCount(this.requests()));

  protected readonly verdict = computed(() => {
    const calls = this.calls().length;
    const sent = this.sent();
    if (!calls) return 'Add a few calls to see the difference.';
    if (sent === calls && this.strategy() === 'merge') return `All ${calls} hit your API.`;
    if (sent < calls) return `${calls - sent} never left the client.`;
    if (this.settled() < sent) return `${sent - this.settled()} were cancelled in flight.`;
    return 'Every call ran, one after another.';
  });

  protected readonly snippet = computed(
    () => `const save = createMutation({
  mutationFn: (input) => api.save(input),
  concurrencyStrategy: '${this.strategy()}',
});`,
  );

  protected pct(ms: number): number {
    return Math.max(0, Math.min(100, (ms / SPAN) * 100));
  }

  protected operatorFor(key: StrategyKey): string {
    return STRATEGIES.find((s) => s.key === key)?.operator ?? '';
  }

  protected glyph(r: Request): string {
    if (r.outcome === 'cancelled') return '×';
    if (r.outcome === 'ignored') return '';
    return String(r.label);
  }

  /** Adds a call where the user clicked. Enter (no event) appends to the end. */
  protected addCall(event: MouseEvent | null): void {
    const next = this.calls().slice();

    if (!event) {
      next.push(Math.min(SPAN - 200, (next.at(-1) ?? 0) + 400));
    } else {
      const el = event.currentTarget as HTMLElement;
      const { left, width } = el.getBoundingClientRect();
      const ratio = (event.clientX - left) / width;
      next.push(Math.round(Math.max(0, Math.min(1, ratio)) * SPAN));
    }

    // Cap it: past a handful of marbles the diagram stops teaching anything.
    this.calls.set(next.sort((a, b) => a - b).slice(0, 8));
  }

  protected removeCall(t: number, event: MouseEvent): void {
    // Don't let the click fall through to the track and immediately re-add one.
    event.stopPropagation();
    this.calls.update((cs) => cs.filter((c) => c !== t));
  }

  protected setDuration(event: Event): void {
    this.duration.set(Number((event.target as HTMLInputElement).value));
  }

  protected reset(): void {
    this.calls.set([...DEFAULT_CALLS]);
    this.duration.set(1200);
  }
}
