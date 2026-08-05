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

/** What each strategy is good for — shown as the picker's tooltip. */
const HINTS: Record<StrategyKey, string> = {
  merge: 'Every call runs in parallel. Good for independent writes.',
  concat: 'Calls queue up and run in order. Good for ordered steps.',
  switch: 'A new call cancels the one in flight. Good for autosave.',
  exhaust: 'Calls are dropped while one is running. Good for submit buttons.',
};

@Component({
  selector: 'app-playground',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './playground.css',
  template: `
    <div class="panel">
      <!-- ── how to use it ────────────────────────────────────────────── -->
      <ol class="guide">
        <li><b>Pick a strategy</b> below.</li>
        <li><b>Click the timeline</b> to fire a call — or press <em>Add call</em>.</li>
        <li><b>Drag the slider</b> to change how long each request takes.</li>
      </ol>

      <!-- ── strategy ─────────────────────────────────────────────────── -->
      <div class="controls">
        <div class="picker" role="radiogroup" aria-label="Concurrency strategy">
          @for (s of strategies; track s.key) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="strategy() === s.key"
              [class.on]="strategy() === s.key"
              [title]="hints[s.key]"
              (click)="strategy.set(s.key)"
            >
              '{{ s.key }}'
            </button>
          }
        </div>

        <div class="knobs">
          <label class="slider" [title]="'How long each request takes: ' + duration() + 'ms'">
            <span class="eyebrow">Each request takes</span>
            <span class="slider-row">
              <em>fast</em>
              <input
                type="range"
                min="200"
                max="2600"
                step="100"
                [value]="duration()"
                (input)="setDuration($event)"
                (change)="setDuration($event)"
                aria-label="Request duration in milliseconds"
              />
              <em>slow</em>
              <output>{{ duration() }}ms</output>
            </span>
          </label>
        </div>
      </div>

      <!-- ── source timeline ──────────────────────────────────────────── -->
      <div class="row">
        <span class="rail">
          <code>mutate()</code>
          <em>{{ calls().length }} call{{ calls().length === 1 ? '' : 's' }}</em>
          <span class="rail-actions">
            <button type="button" (click)="addCall(null)" [disabled]="calls().length >= 8">
              + Add call
            </button>
            <button type="button" (click)="reset()">Reset</button>
          </span>
        </span>

        <div
          class="track clickable"
          role="button"
          tabindex="0"
          title="Click anywhere on this line to fire a call at that moment"
          aria-label="Timeline. Click to add a call."
          (click)="addCall($event)"
          (keydown.enter)="addCall(null)"
        >
          <span class="axis"></span>
          @for (t of calls(); track t) {
            <button
              type="button"
              class="tick"
              [style.left.%]="pct(t)"
              [title]="'Call at ' + t + 'ms — click to remove'"
              [attr.aria-label]="'Remove call at ' + t + 'ms'"
              (click)="removeCall(t, $event)"
            ></button>
          }
          @if (!calls().length) {
            <span class="hint">click anywhere on this line to fire a call</span>
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
          @if (!calls().length) {
            <span class="hint">nothing to run yet</span>
          }
          @for (r of requests(); track r.label) {
            @if (r.outcome !== 'ignored') {
              <span
                class="bar"
                [class.dim]="r.outcome === 'cancelled'"
                [style.left.%]="pct(r.start)"
                [style.width.%]="pct(r.end - r.start)"
                [style.top.px]="r.lane * 15"
              ></span>
              @if (r.start > r.called) {
                <span
                  class="wait"
                  [title]="'Call ' + r.label + ' waited ' + (r.start - r.called) + 'ms in the queue'"
                  [style.left.%]="pct(r.called)"
                  [style.width.%]="pct(r.start - r.called)"
                  [style.top.px]="r.lane * 15"
                ></span>
              }
            }
            <span
              class="marble"
              [class.cancelled]="r.outcome === 'cancelled'"
              [class.ignored]="r.outcome === 'ignored'"
              [style.left.%]="pct(r.end)"
              [style.top.px]="r.lane * 15"
              [title]="describe(r)"
              >{{ glyph(r) }}</span
            >
          }
        </div>
      </div>

      <!-- ── legend ───────────────────────────────────────────────────── -->
      <ul class="legend">
        <li><span class="key settled">1</span> completed — your app gets this result</li>
        <li><span class="key cancelled">&times;</span> cancelled in flight</li>
        <li><span class="key ignored"></span> never sent</li>
      </ul>

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
  protected readonly hints = HINTS;

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
    if (!calls) return 'Add a call to begin.';

    const sent = this.sent();
    const dropped = calls - sent;
    const cancelled = sent - this.settled();

    if (dropped) return `${dropped} never left the client.`;
    if (cancelled) return `${cancelled} cancelled mid-flight.`;
    if (this.strategy() === 'concat') return 'All ran, strictly one at a time.';
    return `All ${calls} hit your API.`;
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

  /** Plain-language explanation, surfaced as the marble's tooltip. */
  protected describe(r: Request): string {
    switch (r.outcome) {
      case 'settled':
        return `Call ${r.label}: ran ${r.start}–${r.end}ms and completed.`;
      case 'cancelled':
        return `Call ${r.label}: started at ${r.start}ms, cancelled at ${r.end}ms by a newer call.`;
      default:
        return `Call ${r.label}: dropped — another request was already running.`;
    }
  }

  /** Adds a call where the user clicked; the button appends a spaced-out one. */
  protected addCall(event: MouseEvent | null): void {
    const next = this.calls().slice();
    if (next.length >= 8) return;

    if (!event) {
      next.push(Math.min(SPAN - 200, (next.at(-1) ?? 0) + 500));
    } else {
      const el = event.currentTarget as HTMLElement;
      const { left, width } = el.getBoundingClientRect();
      const ratio = (event.clientX - left) / width;
      next.push(Math.round(Math.max(0, Math.min(1, ratio)) * SPAN));
    }

    this.calls.set(next.sort((a, b) => a - b));
  }

  protected removeCall(t: number, event: MouseEvent): void {
    // Otherwise the click reaches the track and immediately re-adds a call.
    event.stopPropagation();
    this.calls.update((cs) => cs.filter((c) => c !== t));
  }

  protected setDuration(event: Event): void {
    this.duration.set(Number((event.target as HTMLInputElement).value));
  }

  protected reset(): void {
    this.calls.set([...DEFAULT_CALLS]);
    this.duration.set(1200);
    this.strategy.set('exhaust');
  }
}
