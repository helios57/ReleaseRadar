import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { SessionStore } from '../../../core/auth/session.store';
import { DialogStore } from '../../../core/dialog.store';
import { LiveService } from '../../../core/live.service';
import { RefreshBus } from '../../../core/refresh.bus';
import { productColor, STAGE } from '../../../core/stage';
import { Product } from '../../../core/models/rollout.models';
import { IconComponent, ICONS } from '../../ui/icon.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { CreateRolloutModalComponent } from '../../../features/create/create-rollout-modal.component';
import { CreateLockModalComponent } from '../../../features/create/create-lock-modal.component';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  link: string;
  badge?: number;
}

@Component({
  selector: 'rr-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    AvatarComponent,
    CreateRolloutModalComponent,
    CreateLockModalComponent,
  ],
  templateUrl: './shell.component.html',
  styles: [
    `
      .rr-live {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--muted);
        user-select: none;
      }
      .rr-live-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--muted-2);
        flex-shrink: 0;
      }
      /* live → green, reconnecting → amber, connecting/offline → neutral */
      .rr-live[data-status='live'] {
        color: var(--ok);
      }
      .rr-live[data-status='live'] .rr-live-dot {
        background: var(--ok);
        box-shadow: 0 0 6px var(--ok);
      }
      .rr-live[data-status='reconnecting'] {
        color: var(--warn);
      }
      .rr-live[data-status='reconnecting'] .rr-live-dot {
        background: var(--warn);
        box-shadow: 0 0 6px var(--warn);
      }
      @media (prefers-reduced-motion: no-preference) {
        .rr-live[data-status='reconnecting'] .rr-live-dot {
          animation: rr-live-pulse 1s ease-in-out infinite;
        }
      }
      @keyframes rr-live-pulse {
        50% {
          opacity: 0.35;
        }
      }
    `,
  ],
})
export class ShellComponent {
  private api = inject(ApiService);
  private bus = inject(RefreshBus);
  protected session = inject(SessionStore);
  protected dialog = inject(DialogStore);
  protected live = inject(LiveService);
  protected ICONS = ICONS;
  protected STAGE = STAGE;
  protected stageKeys = Object.keys(STAGE);

  protected nav: NavItem[] = [
    { id: 'timeline', label: 'Timeline', icon: ICONS['timeline'], link: '/timeline' },
    { id: 'list', label: 'Rollouts', icon: ICONS['rollout'], link: '/list' },
    { id: 'locks', label: 'Locks', icon: ICONS['lock'], link: '/locks' },
    { id: 'data', label: 'Master Data', icon: ICONS['data'], link: '/data' },
    { id: 'contacts', label: 'Contacts', icon: ICONS['people'], link: '/contacts' },
    { id: 'docs', label: 'API & MCP', icon: ICONS['code'], link: '/docs' },
  ];

  // Refetch off tick$ so live product changes refresh the sidebar nav/filters.
  // switchMap to a single request keeps the previous value during the in-flight
  // window (toSignal only flashes initialValue on the very first paint), so the
  // chip list never blanks on a bump.
  protected readonly products = toSignal(
    this.bus.tick$.pipe(
      switchMap(() => this.api.products().pipe(catchError(() => of<Product[]>([])))),
    ),
    { initialValue: [] as Product[] },
  );

  protected readonly currentUser = computed(() => this.session.user());
  protected readonly canEdit = computed(() => this.session.canEdit());

  // Connection-status indicator (header). Maps status → human label + tone.
  protected readonly liveStatus = this.live.status;
  protected readonly liveLabel = computed(() => {
    switch (this.liveStatus()) {
      case 'live':
        return 'Live';
      case 'reconnecting':
        return 'Reconnecting…';
      case 'connecting':
        return 'Connecting…';
      default:
        return 'Offline';
    }
  });

  protected productColor = productColor;

  protected onCreateRollout(): void {
    if (!this.canEdit()) return;
    this.dialog.openRollout();
  }

  protected onCreateLock(): void {
    if (!this.canEdit()) return;
    this.dialog.openLock();
  }
}
