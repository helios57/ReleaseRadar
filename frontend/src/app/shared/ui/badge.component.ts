import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type Tone = 'neutral' | 'info' | 'warn' | 'danger' | 'ok';

const TONE: Record<Tone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: 'rgba(113,113,122,.16)', fg: '#e4e4e7', bd: 'rgba(113,113,122,.4)' },
  info: { bg: 'rgba(56,139,253,.12)', fg: '#7cc4ff', bd: 'rgba(56,139,253,.4)' },
  warn: { bg: 'rgba(245,158,11,.12)', fg: '#fbbf24', bd: 'rgba(245,158,11,.4)' },
  danger: { bg: 'rgba(239,68,68,.12)', fg: '#fca5a5', bd: 'rgba(239,68,68,.45)' },
  ok: { bg: 'rgba(34,197,94,.12)', fg: '#86efac', bd: 'rgba(34,197,94,.4)' },
};

@Component({
  selector: 'rr-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="rr-badge"
      [style.background]="palette().bg"
      [style.color]="palette().fg"
      [style.borderColor]="palette().bd"
      [style.fontFamily]="mono() ? 'var(--mono)' : 'inherit'"
    >
      @if (dot()) {
        <span class="rr-badge-dot" [style.background]="palette().fg"></span>
      }
      <ng-content />
    </span>
  `,
})
export class BadgeComponent {
  readonly tone = input<Tone>('neutral');
  readonly dot = input(false);
  readonly mono = input(false);
  protected readonly palette = computed(() => TONE[this.tone()] ?? TONE.neutral);
}
