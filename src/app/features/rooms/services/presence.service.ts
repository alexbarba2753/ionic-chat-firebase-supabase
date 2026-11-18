import type { OnDestroy } from '@angular/core';
import { Injectable, inject, signal } from '@angular/core';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import type { UserPresence, UserProfile } from '../../../core/models/user-profile.model';
import { FirebaseClientService } from '../../../core/services/firebase-client.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export interface ResolvedPresence {
  isOnline: boolean;
  lastSeen: unknown;
  statusText: string;
}

@Injectable({
  providedIn: 'root',
})
export class PresenceService implements OnDestroy {
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly supabaseClient = inject(SupabaseClientService);

  readonly presenceMap = signal<Record<string, UserPresence>>({});

  private allPresenceUnsubscribe: (() => void) | null = null;
  private lifecycleCleanup: (() => void) | null = null;
  private subscriberCount = 0;

  ngOnDestroy(): void {
    this.stopLifecycleTracking();
    if (this.allPresenceUnsubscribe) {
      this.allPresenceUnsubscribe();
      this.allPresenceUnsubscribe = null;
    }
  }

  subscribeAllPresence(): () => void {
    this.subscriberCount += 1;
    if (!this.allPresenceUnsubscribe && this.firebaseClient.auth.currentUser) {
      this.allPresenceUnsubscribe = onSnapshot(
        collection(this.firebaseClient.firestore, 'user_presence'),
        (snapshot) => {
          const nextMap: Record<string, UserPresence> = {};
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data() as Partial<UserPresence>;
            const uid = data.uid ?? docSnap.id;
            nextMap[uid] = {
              uid,
              displayName: data.displayName ?? 'Usuario',
              photoURL: data.photoURL ?? null,
              isOnline: Boolean(data.isOnline),
              lastSeen: data.lastSeen ?? null,
              statusText: data.statusText ?? (data.isOnline ? 'En linea' : 'Desconectado'),
            };
          }
          this.presenceMap.set(nextMap);
        },
        () => undefined,
      );
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.subscriberCount = Math.max(0, this.subscriberCount - 1);
      if (this.subscriberCount === 0 && this.allPresenceUnsubscribe) {
        this.allPresenceUnsubscribe();
        this.allPresenceUnsubscribe = null;
      }
    };
  }

  watchUserPresence(uid: string, onChange: (presence: UserPresence | null) => void): () => void {
    if (!uid || !this.firebaseClient.auth.currentUser) {
      onChange(null);
      return () => undefined;
    }

    return onSnapshot(
      doc(this.firebaseClient.firestore, 'user_presence', uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          onChange(null);
          return;
        }
        const data = snapshot.data() as Partial<UserPresence>;
        onChange({
          uid: data.uid ?? snapshot.id,
          displayName: data.displayName ?? 'Usuario',
          photoURL: data.photoURL ?? null,
          isOnline: Boolean(data.isOnline),
          lastSeen: data.lastSeen ?? null,
          statusText: data.statusText ?? (data.isOnline ? 'En linea' : 'Desconectado'),
        });
      },
      () => onChange(null),
    );
  }

  startLifecycleTracking(): () => void {
    if (this.lifecycleCleanup) {
      return this.lifecycleCleanup;
    }

    void this.setOnlineStatus(true);

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        void this.setOnlineStatus(!document.hidden);
      }
    };

    const onPageHide = () => {
      void this.setOnlineStatus(false);
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide);
    }

    this.lifecycleCleanup = () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
      }
      this.lifecycleCleanup = null;
    };

    return this.lifecycleCleanup;
  }

  stopLifecycleTracking(): void {
    if (this.lifecycleCleanup) {
      this.lifecycleCleanup();
    }
  }

  async setOnlineStatus(isOnline: boolean, statusText?: string): Promise<void> {
    const user = await this.firebaseClient.waitForAuthReady();
    if (!user) {
      return;
    }

    const nowIso = new Date().toISOString();
    const resolvedStatus = statusText ?? (isOnline ? 'En linea' : 'Desconectado');
    const supabasePayload: Record<string, unknown> = {
      is_online: isOnline,
      last_seen: nowIso,
      updated_at: nowIso,
    };
    if (statusText !== undefined) {
      supabasePayload['status_text'] = statusText;
    }

    await Promise.allSettled([
      this.supabaseClient.client.from('profiles').update(supabasePayload).eq('firebase_uid', user.uid),
      setDoc(
        doc(this.firebaseClient.firestore, 'user_presence', user.uid),
        {
          uid: user.uid,
          displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Usuario',
          photoURL: user.photoURL ?? null,
          isOnline,
          statusText: resolvedStatus,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ]);
  }

  resolvePresence(
    profile: Pick<UserProfile, 'firebase_uid' | 'is_online' | 'last_seen' | 'status_text'>,
  ): ResolvedPresence {
    const live = this.presenceMap()[profile.firebase_uid];
    if (live) {
      return {
        isOnline: live.isOnline,
        lastSeen: live.lastSeen ?? profile.last_seen,
        statusText: live.statusText || profile.status_text,
      };
    }

    return {
      isOnline: profile.is_online,
      lastSeen: profile.last_seen,
      statusText: profile.status_text || (profile.is_online ? 'En linea' : 'Desconectado'),
    };
  }

  formatLastSeen(lastSeen: unknown, isOnline = false): string {
    if (isOnline) {
      return 'En linea';
    }
    const date = this.toDate(lastSeen);
    if (!date) {
      return 'Desconectado';
    }

    const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMinutes < 1) {
      return 'Visto hace un momento';
    }
    if (diffMinutes < 60) {
      return `Visto hace ${diffMinutes} min`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `Visto hace ${diffHours} h`;
    }
    return `Ult. vez ${date.toLocaleDateString()}`;
  }

  private toDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (
      typeof value === 'object' &&
      'toDate' in value &&
      typeof (value as { toDate: () => Date }).toDate === 'function'
    ) {
      const parsed = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }
}
