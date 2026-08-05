import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  signal,
  viewChild,
} from '@angular/core';
import { animate, stagger } from 'animejs';
import { Toast } from './toast/toast';
import { MarbleDiagram, STRATEGIES, StrategyKey } from './marble-diagram/marble-diagram';

type Kind = 'yes' | 'no' | 'partial';

interface ComparisonRow {
  feature: string;
  mine: string;
  mineKind: Kind;
  theirs: string;
  theirsKind: Kind;
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarbleDiagram, Toast],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly pkg = '@ali7040/ng-signal-query';
  readonly version = '0.1.0';
  readonly angularVersion = '21';

  readonly strategies = STRATEGIES;

  readonly useCase: Record<StrategyKey, string> = {
    merge: 'Independent writes — analytics events, unrelated records.',
    concat: 'Order-dependent steps, or a queue the server must receive in sequence.',
    switch: 'Autosave and draft syncing, where only the newest value matters.',
    exhaust: 'Submit and checkout buttons. Double-clicks stop being your problem.',
  };

  readonly strategySnippet = `// Double-click proof. No disabled flag, no debounce.
const submit = createMutation({
  mutationFn: (order: Order) => api.place(order),
  concurrencyStrategy: 'exhaust',
});

// Autosave — only the newest draft survives.
const autosave = createMutation({
  mutationFn: (draft: Draft) => api.save(draft),
  concurrencyStrategy: 'switch',
});`;

  readonly fixes = [
    {
      title: 'A slow response could overwrite fresh data',
      body:
        'If a refetch began while an earlier request was still in flight, whichever settled last won — so an older payload could silently replace newer cached data. Every fetch now carries a generation, and only the newest is allowed to commit.',
    },
    {
      title: 'The same key fired duplicate requests',
      body:
        'Two components reading the same query key issued two network calls despite sharing a cache entry. Concurrent fetches for a key now share one in-flight promise.',
    },
    {
      title: 'Signal queries diverged from the cache',
      body:
        'createSignalQuery kept a private copy of state rather than the shared entry, so setQueryData() and invalidation could silently fail to reach it. It now reads and writes the real entry.',
    },
  ];

  readonly comparison: ComparisonRow[] = [
    {
      feature: 'Reactivity model',
      mine: 'Signals all the way down — the cache entry is a WritableSignal',
      mineKind: 'yes',
      theirs: 'Framework-agnostic core with QueryObserver + notifyManager, signals bound at the edge',
      theirsKind: 'partial',
    },
    {
      feature: 'Frameworks supported',
      mine: 'Angular only',
      mineKind: 'no',
      theirs: 'React, Vue, Solid, Svelte, Angular',
      theirsKind: 'yes',
    },
    {
      feature: 'Mutation concurrency',
      mine: 'merge · concat · switch · exhaust',
      mineKind: 'yes',
      theirs: 'scope queues same-scope mutations; no switch or exhaust',
      theirsKind: 'partial',
    },
    {
      feature: 'Request cancellation',
      mine: 'AbortSignal passed to every fetcher',
      mineKind: 'yes',
      theirs: 'Yes',
      theirsKind: 'yes',
    },
    {
      feature: 'Retry with backoff',
      mine: 'Opt-in, defaults to off',
      mineKind: 'yes',
      theirs: 'On by default',
      theirsKind: 'yes',
    },
    {
      feature: 'enabled / conditional queries',
      mine: 'Not yet',
      mineKind: 'no',
      theirs: 'Yes',
      theirsKind: 'yes',
    },
    {
      feature: 'select, placeholderData, isFetching',
      mine: 'Not yet',
      mineKind: 'no',
      theirs: 'Yes',
      theirsKind: 'yes',
    },
    {
      feature: 'Persistence and offline mode',
      mine: 'Not yet',
      mineKind: 'no',
      theirs: 'Yes',
      theirsKind: 'yes',
    },
    {
      feature: 'Devtools',
      mine: 'Basic inspector component',
      mineKind: 'partial',
      theirs: 'Mature, dedicated package',
      theirsKind: 'yes',
    },
    {
      feature: 'Production track record',
      mine: 'Released 2026. Early.',
      mineKind: 'no',
      theirs: 'Years, across four frameworks',
      theirsKind: 'yes',
    },
    {
      feature: 'Install size',
      mine: '34 kB unpacked, tslib only',
      mineKind: 'yes',
      theirs: 'Larger — core plus adapter',
      theirsKind: 'partial',
    },
  ];

  readonly samples = [
    {
      title: 'A query',
      note: 'Pass the signal through so superseded requests are actually cancelled.',
      code: `const users = createQuery({
  key: ['users'],
  fetcher: ({ signal }) =>
    fetch('/api/users', { signal }).then(r => r.json()),
  staleTime: 30_000,
});

// users.data() · users.isLoading() · users.refetch()`,
    },
    {
      title: 'A reactive query',
      note: 'Reads signals inside the factory; re-runs when the key changes.',
      code: `const userId = signal(1);

const user = createSignalQuery(() => ({
  key: ['user', userId()],
  fetcher: ({ signal }) =>
    fetch(\`/api/users/\${userId()}\`, { signal }).then(r => r.json()),
}));

userId.set(2); // aborts the previous request, fetches the new key`,
    },
    {
      title: 'A mutation',
      note: 'Optimistic update with automatic rollback if the server rejects it.',
      code: `const addTodo = createMutation({
  mutationFn: (text: string) => api.create(text),
  concurrencyStrategy: 'concat',
  optimisticUpdate: (text) =>
    client.setQueryData<Todo[]>(['todos'], (old) => [
      ...(old ?? []),
      { id: 'tmp', text },
    ]),
  invalidateQueries: [['todos']],
});`,
    },
  ];

  // --- install button ------------------------------------------------------

  readonly copied = signal(false);

  private readonly toast = viewChild.required(Toast);
  private readonly heroRoot = viewChild<ElementRef<HTMLElement>>('hero');

  async copyInstall(): Promise<void> {
    const text = `npm i ${this.pkg}`;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      this.toast().show('Copied to clipboard');
      setTimeout(() => this.copied.set(false), 1600);
    } catch {
      // Clipboard refused (insecure context, or the user declined). Say so
      // rather than claiming a copy that never happened.
      this.toast().show('Press Ctrl+C to copy');
    }
  }

  // --- theme ---------------------------------------------------------------

  readonly theme = signal<'light' | 'dark'>('light');

  readonly themeLabel = () =>
    this.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  constructor() {
    if (typeof matchMedia === 'function') {
      this.theme.set(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    // One orchestrated entrance, rather than effects scattered down the page.
    afterNextRender(() => {
      document.documentElement.classList.add('js');

      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const targets = this.heroRoot()?.nativeElement.querySelectorAll('.stagger-in');
      if (!targets?.length) return;

      animate(targets, {
        opacity: [0, 1],
        translateY: [18, 0],
        duration: 760,
        delay: stagger(90),
        ease: 'out(3)',
      });
    });
  }

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.dataset['theme'] = next;
  }
}
