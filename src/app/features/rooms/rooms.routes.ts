import type { Routes } from '@angular/router';

export const ROOMS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/rooms-list/rooms-list.page').then((m) => m.RoomsListPage),
  },
  {
    path: 'directory',
    loadComponent: () => import('./pages/directory/directory.page').then((m) => m.DirectoryPage),
  },
  {
    path: 'create',
    loadComponent: () => import('./pages/create-room/create-room.page').then((m) => m.CreateRoomPage),
  },
  {
    path: ':roomId/settings',
    loadComponent: () => import('./pages/room-settings/room-settings.page').then((m) => m.RoomSettingsPage),
  },
];
