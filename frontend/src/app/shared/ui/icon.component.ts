import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export const ICONS: Record<string, string> = {
  timeline: 'M3 6h18M3 12h12M3 18h7',
  rollout: 'M4 12h10M4 12l4-4M4 12l4 4M14 4h6v16h-6',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 1 1 8 0v3',
  data: 'M4 6c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2zm0 0v12c0 1.1 3.6 2 8 2s8-.9 8-2V6M4 12c0 1.1 3.6 2 8 2s8-.9 8-2',
  people: 'M16 11a3 3 0 1 0-3-3M3 20a6 6 0 0 1 12 0M17 13a5 5 0 0 1 4 7M8 8a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
  cal: 'M3 5h18v16H3zM3 9h18M8 3v4M16 3v4',
  download: 'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 5 5',
  plus: 'M12 5v14M5 12h14',
  warn: 'M12 3l10 18H2L12 3zM12 10v5M12 18v.5',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  chev: 'M9 6l6 6-6 6',
  bolt: 'M13 3 4 14h7l-1 7 9-11h-7l1-7z',
  filter: 'M3 5h18M6 12h12M10 19h4',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  copy: 'M9 9h11v11H9zM5 15V5h10',
  code: 'M9 4l-5 8 5 8M15 4l5 8-5 8M14 4L10 20',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
};

@Component({
  selector: 'rr-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="stroke()"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
})
export class IconComponent {
  readonly name = input<string | null>(null);
  readonly d = input<string | null>(null);
  readonly size = input(14);
  readonly stroke = input(1.6);

  path(): string {
    const explicit = this.d();
    if (explicit) return explicit;
    const key = this.name();
    return key && ICONS[key] ? ICONS[key] : '';
  }
}
