import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Actor } from '../../core/models/rollout.models';

@Component({
  selector: 'rr-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actor(); as a) {
      <div
        class="rr-avatar"
        [title]="a.name + (a.role === 'admin' ? ' (admin)' : ' (readonly)')"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [style.fontSize.px]="size() * 0.42"
        [style.background]="
          'linear-gradient(135deg, hsl(' + a.hue + ' 60% 38%), hsl(' + a.hue + ' 60% 24%))'
        "
        [style.boxShadow]="
          ring()
            ? '0 0 0 2px #0a0a0c, 0 0 0 3px hsl(' + a.hue + ' 60% 45%)'
            : 'inset 0 0 0 1px rgba(255,255,255,.08)'
        "
      >
        {{ a.initials }}
      </div>
    }
  `,
})
export class AvatarComponent {
  readonly actor = input<Actor | null>(null);
  readonly size = input(22);
  readonly ring = input(false);
}

@Component({
  selector: 'rr-avatar-stack',
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rr-avstack" [style]="stackStyle()">
      @for (a of actors(); track a.id) {
        <rr-avatar [actor]="a" [size]="size()" />
      }
    </div>
  `,
})
export class AvatarStackComponent {
  readonly actors = input<Actor[]>([]);
  readonly size = input(22);
  protected readonly stackStyle = computed(() => `--sz: ${this.size()}px`);
}
