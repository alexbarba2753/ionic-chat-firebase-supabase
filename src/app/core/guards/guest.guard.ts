import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';

import { FirebaseClientService } from '../services/firebase-client.service';

export const guestGuard: CanActivateFn = async () => {
  const firebaseClient = inject(FirebaseClientService);
  const router = inject(Router);
  const user = await firebaseClient.waitForAuthReady();
  return user ? router.createUrlTree(['/rooms']) : true;
};
