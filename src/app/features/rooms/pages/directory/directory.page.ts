import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  IonAvatar,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { Subject, debounceTime, distinctUntilChanged, from, switchMap } from 'rxjs';

import type { UserProfile } from '../../../../core/models/user-profile.model';
import { FirebaseClientService } from '../../../../core/services/firebase-client.service';
import { DirectoryService } from '../../services/directory.service';
import { PresenceService } from '../../services/presence.service';
import { RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-directory',
  templateUrl: './directory.page.html',
  styleUrls: ['./directory.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonSearchbar,
    IonContent,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonButton,
    IonIcon,
    IonSpinner,
  ],
})
export class DirectoryPage implements OnInit, OnDestroy {
  private readonly directoryService = inject(DirectoryService);
  private readonly presenceService = inject(PresenceService);
  private readonly roomsService = inject(RoomsService);
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly openingUid = signal<string | null>(null);
  readonly users = signal<UserProfile[]>([]);
  readonly presenceMap = this.presenceService.presenceMap;

  private readonly search$ = new Subject<string>();
  private currentUid: string | undefined;
  private unsubPresence: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    this.unsubPresence = this.presenceService.subscribeAllPresence();
    const user = await this.firebaseClient.waitForAuthReady();
    this.currentUid = user?.uid;

    this.search$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loading.set(true);
          return from(
            this.directoryService.searchUsers(term, {
              excludeUid: this.currentUid,
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => {
          this.users.set(results);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          void this.showToast('Error al buscar usuarios en el directorio.', 'danger');
        },
      });

    await this.loadInitialUsers();
  }

  ngOnDestroy(): void {
    this.unsubPresence?.();
  }

  onSearchInput(event: CustomEvent): void {
    const value = (event.detail as { value?: string | null }).value ?? '';
    this.search$.next(value);
  }

  async startDirectChat(user: UserProfile): Promise<void> {
    this.openingUid.set(user.firebase_uid);
    try {
      const room = await this.roomsService.getOrCreateDirectRoom(user.firebase_uid);
      await this.router.navigate(['/chat', room.id]);
    } catch {
      await this.showToast('No se pudo abrir el chat directo.', 'danger');
    } finally {
      this.openingUid.set(null);
    }
  }

  isUserOnline(user: UserProfile): boolean {
    void this.presenceMap();
    return this.presenceService.resolvePresence(user).isOnline;
  }

  getPresenceLabel(user: UserProfile): string {
    void this.presenceMap();
    const resolved = this.presenceService.resolvePresence(user);
    if (resolved.isOnline) {
      return resolved.statusText || 'En linea';
    }
    return this.presenceService.formatLastSeen(resolved.lastSeen, false);
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  private async loadInitialUsers(): Promise<void> {
    this.loading.set(true);
    try {
      const results = await this.directoryService.searchUsers('', {
        excludeUid: this.currentUid,
      });
      this.users.set(results);
    } catch {
      await this.showToast('No se pudo cargar el directorio.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2400,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
