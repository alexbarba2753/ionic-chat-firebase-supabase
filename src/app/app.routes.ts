import type { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'rooms',
    canActivate: [authGuard],
    loadChildren: () => import('./features/rooms/rooms.routes').then((m) => m.ROOMS_ROUTES),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadChildren: () => import('./features/chat/chat.routes').then((m) => m.CHAT_ROUTES),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadChildren: () => import('./features/profile/profile.routes').then((m) => m.PROFILE_ROUTES),
  },
  {
    path: '',
    redirectTo: 'rooms',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'rooms',
  },
];
