import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { SessionStore } from '../../../core/auth/session.store';
import { DialogStore } from '../../../core/dialog.store';
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
})
export class ShellComponent {
  private api = inject(ApiService);
  protected session = inject(SessionStore);
  protected dialog = inject(DialogStore);
  protected ICONS = ICONS;
  protected STAGE = STAGE;
  protected stageKeys = Object.keys(STAGE);

  protected nav: NavItem[] = [
    { id: 'timeline', label: 'Timeline', icon: ICONS['timeline'], link: '/timeline' },
    { id: 'list', label: 'Rollouts', icon: ICONS['rollout'], link: '/list' },
    { id: 'locks', label: 'Locks', icon: ICONS['lock'], link: '/locks' },
    { id: 'data', label: 'Master Data', icon: ICONS['data'], link: '/data' },
    { id: 'docs', label: 'API & MCP', icon: ICONS['code'], link: '/docs' },
  ];

  protected readonly products = toSignal(
    this.api.products().pipe(catchError(() => of<Product[]>([]))),
    { initialValue: [] as Product[] },
  );

  protected readonly currentUser = computed(() => this.session.user());
  protected readonly canEdit = computed(() => this.session.canEdit());

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
