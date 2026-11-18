import type { Routes } from '@angular/router';

export const CHAT_ROUTES: Routes = [
  {
    path: ':roomId',
    loadComponent: () => import('./pages/chat-room/chat-room.page').then((m) => m.ChatRoomPage),
  },
];
