import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { FirebaseClientService } from '../../../core/services/firebase-client.service';

export interface TypingUser {
  uid: string;
  displayName: string;
  roomId: string;
  isTyping: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TypingService {
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastActiveSent = new Map<string, number>();

  notifyTyping(roomId: string, uid: string, displayName: string): void {
    const key = `${roomId}_${uid}`;
    const now = Date.now();
    const lastSent = this.lastActiveSent.get(key) ?? 0;

    if (now - lastSent > 2000) {
      this.lastActiveSent.set(key, now);
      void this.writeTypingState(roomId, uid, displayName, true);
    }

    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.lastActiveSent.delete(key);
      void this.writeTypingState(roomId, uid, displayName, false);
    }, 3000);

    this.timers.set(key, timer);
  }

  async stopTyping(roomId: string, uid: string, displayName = ''): Promise<void> {
    const key = `${roomId}_${uid}`;
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(key);
    }
    const wasActive = this.lastActiveSent.has(key);
    this.lastActiveSent.delete(key);

    if (wasActive) {
      await this.writeTypingState(roomId, uid, displayName, false);
    }
  }

  subscribeToTyping(roomId: string, currentUid: string, onChange: (typingUsers: TypingUser[]) => void): Unsubscribe {
    const ref = collection(this.firebaseClient.firestore, 'typing_states');
    const q = query(ref, where('roomId', '==', roomId));

    return onSnapshot(q, (snapshot) => {
      const nowMs = Date.now();
      const users: TypingUser[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as {
          uid?: string;
          displayName?: string;
          roomId?: string;
          isTyping?: boolean;
          updatedAt?: Timestamp | string | null;
        };

        if (!data.isTyping || !data.uid || data.uid === currentUid) {
          continue;
        }

        const updatedMs = this.resolveTimeMs(data.updatedAt);
        if (updatedMs !== null && nowMs - updatedMs > 15000) {
          continue;
        }

        users.push({
          uid: data.uid,
          displayName: data.displayName || 'Alguien',
          roomId: data.roomId || roomId,
          isTyping: true,
        });
      }

      onChange(users);
    });
  }

  private async writeTypingState(roomId: string, uid: string, displayName: string, isTyping: boolean): Promise<void> {
    try {
      const docRef = doc(this.firebaseClient.firestore, 'typing_states', `${roomId}_${uid}`);
      await setDoc(docRef, {
        roomId: roomId.slice(0, 128),
        uid: uid.slice(0, 128),
        displayName: (displayName || 'Usuario').slice(0, 100),
        isTyping,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // ignora errores efimeros de red al actualizar typing
    }
  }

  private resolveTimeMs(value: Timestamp | string | null | undefined): number | null {
    if (!value) {
      return null;
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof value.toMillis === 'function') {
      return value.toMillis();
    }
    return null;
  }
}
