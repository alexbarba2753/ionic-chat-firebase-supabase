import { Injectable } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import { getApp, getApps, initializeApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FirebaseClientService {
  readonly app: FirebaseApp = getApps().length ? getApp() : initializeApp(environment.firebase);
  readonly auth: Auth = getAuth(this.app);
  readonly firestore: Firestore = getFirestore(this.app);

  waitForAuthReady(): Promise<User | null> {
    if (this.auth.currentUser) {
      return Promise.resolve(this.auth.currentUser);
    }
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(
        this.auth,
        (user) => {
          unsubscribe();
          resolve(user);
        },
        () => {
          unsubscribe();
          resolve(null);
        },
      );
    });
  }
}
