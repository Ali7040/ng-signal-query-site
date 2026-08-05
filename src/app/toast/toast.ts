import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  signal,
  viewChild,
} from '@angular/core';
import { animate } from 'animejs';

/**
 * Single transient confirmation, anchored bottom-centre.
 *
 * Kept as its own component so the animation lives next to the markup it
 * drives, and so the rest of the page never has to think about timers.
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './toast.css',
  template: `
    @if (visible()) {
      <div #card class="toast" role="status" aria-live="polite">
        <svg
          class="mark"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path #tick d="M5 13l4.5 4.5L19 7" />
        </svg>
        <span>{{ message() }}</span>
      </div>
    }
  `,
})
export class Toast {
  readonly message = signal('');
  readonly visible = signal(false);

  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly tick = viewChild<ElementRef<SVGPathElement>>('tick');

  private hideTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Runs once the card exists in the DOM, so anime.js has something to target.
    effect(() => {
      const card = this.card()?.nativeElement;
      const tick = this.tick()?.nativeElement;
      if (!card) return;

      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      animate(card, {
        translateY: [14, 0],
        scale: [0.94, 1],
        opacity: [0, 1],
        duration: 420,
        ease: 'out(3)',
      });

      // Draw the checkmark rather than popping it in.
      if (tick) {
        const len = tick.getTotalLength();
        tick.style.strokeDasharray = `${len}`;
        animate(tick, {
          strokeDashoffset: [len, 0],
          duration: 380,
          delay: 90,
          ease: 'out(2)',
        });
      }
    });
  }

  show(message: string, ms = 2200): void {
    clearTimeout(this.hideTimer);
    this.message.set(message);

    // Re-mount so the entrance animation replays on repeat presses.
    this.visible.set(false);
    queueMicrotask(() => this.visible.set(true));

    this.hideTimer = setTimeout(() => this.dismiss(), ms);
  }

  private dismiss(): void {
    const card = this.card()?.nativeElement;
    if (!card || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.visible.set(false);
      return;
    }

    animate(card, {
      translateY: [0, 10],
      opacity: [1, 0],
      duration: 220,
      ease: 'in(2)',
      onComplete: () => this.visible.set(false),
    });
  }
}
