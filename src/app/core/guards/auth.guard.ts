import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';

import { FirebaseClientService } from '../services/firebase-client.service';

export const authGuard: CanActivateFn = async () => {
  const firebaseClient = inject(FirebaseClientService);
  const router = inject(Router);
  const user = await firebaseClient.waitForAuthReady();
  return user ? true : router.createUrlTree(['/auth/login']);
};
