import { CommonModule } from '@angular/common';
import type { OnInit } from '@angular/core';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonAvatar,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';

import type { RoomType } from '../../../../core/models/chat-room.model';
import type { UserProfile } from '../../../../core/models/user-profile.model';
import { FirebaseClientService } from '../../../../core/services/firebase-client.service';
import { DirectoryService } from '../../services/directory.service';
import { RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-create-room',
  templateUrl: './create-room.page.html',
  styleUrls: ['./create-room.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonInput,
    IonTextarea,
    IonToggle,
    IonSearchbar,
    IonList,
    IonItem,
    IonAvatar,
    IonCheckbox,
    IonChip,
    IonButton,
    IonIcon,
    IonSpinner,
  ],
})
export class CreateRoomPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly directoryService = inject(DirectoryService);
  private readonly roomsService = inject(RoomsService);
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  readonly loadingUsers = signal(true);
  readonly creating = signal(false);
  readonly candidates = signal<UserProfile[]>([]);
  readonly selectedMap = signal<Record<string, UserProfile>>({});

  readonly selectedUsers = computed(() => Object.values(this.selectedMap()));

  readonly form = this.fb.nonNullable.group({
    room_type: ['group' as Exclude<RoomType, 'direct'>],
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(240)]],
    is_private: [true],
  });

  private currentUid: string | undefined;

  async ngOnInit(): Promise<void> {
    const user = await this.firebaseClient.waitForAuthReady();
    this.currentUid = user?.uid;
    await this.searchCandidates('');
  }

  onTypeChange(event: CustomEvent): void {
    const value = (event.detail as { value?: string }).value;
    if (value === 'group' || value === 'channel') {
      this.form.patchValue({
        room_type: value,
        is_private: value === 'group',
      });
    }
  }

  async onSearchCandidates(event: CustomEvent): Promise<void> {
    const query = (event.detail as { value?: string | null }).value ?? '';
    await this.searchCandidates(query);
  }

  isSelected(uid: string): boolean {
    return Boolean(this.selectedMap()[uid]);
  }

  toggleCandidate(user: UserProfile): void {
    const next = { ...this.selectedMap() };
    if (next[user.firebase_uid]) {
      delete next[user.firebase_uid];
    } else {
      next[user.firebase_uid] = user;
    }
    this.selectedMap.set(next);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      await this.showToast('Ingresa un nombre valido para la sala.', 'warning');
      return;
    }

    this.creating.set(true);
    try {
      const raw = this.form.getRawValue();
      const created = await this.roomsService.createRoom({
        name: raw.name,
        description: raw.description,
        room_type: raw.room_type,
        is_private: raw.is_private,
        member_uids: Object.keys(this.selectedMap()),
      });
      await this.showToast('Sala creada correctamente.', 'success');
      await this.router.navigate(['/chat', created.id], { replaceUrl: true });
    } catch {
      await this.showToast('No se pudo crear la sala.', 'danger');
    } finally {
      this.creating.set(false);
    }
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  private async searchCandidates(query: string): Promise<void> {
    this.loadingUsers.set(true);
    try {
      const results = await this.directoryService.searchUsers(query, {
        excludeUid: this.currentUid,
        limit: 30,
      });
      this.candidates.set(results);
    } catch {
      await this.showToast('Error al cargar contactos.', 'danger');
    } finally {
      this.loadingUsers.set(false);
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
