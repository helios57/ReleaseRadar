import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shared/layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'timeline' },
      {
        path: 'timeline',
        loadComponent: () =>
          import('./features/timeline/timeline-view/timeline-view.component').then(
            (m) => m.TimelineViewComponent,
          ),
      },
      {
        path: 'list',
        loadComponent: () =>
          import('./features/list/list-view/list-view.component').then(
            (m) => m.ListViewComponent,
          ),
      },
      {
        path: 'locks',
        loadComponent: () =>
          import('./features/locks/locks-view/locks-view.component').then(
            (m) => m.LocksViewComponent,
          ),
      },
      {
        path: 'data',
        loadComponent: () =>
          import('./features/master-data/master-data-view/master-data-view.component').then(
            (m) => m.MasterDataViewComponent,
          ),
      },
      {
        path: 'docs',
        loadComponent: () =>
          import('./features/docs/docs-view/docs-view.component').then(
            (m) => m.DocsViewComponent,
          ),
      },
      {
        path: 'rollout/:id',
        loadComponent: () =>
          import('./features/rollout-detail/rollout-detail.component').then(
            (m) => m.RolloutDetailComponent,
          ),
      },
    ],
  },
];
