import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonAvatar,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';

import type { ChatRoom, RoomMember, RoomRole } from '../../../../core/models/chat-room.model';
import type { UserProfile } from '../../../../core/models/user-profile.model';
import { FirebaseClientService } from '../../../../core/services/firebase-client.service';
import { DirectoryService } from '../../services/directory.service';
import { PresenceService } from '../../services/presence.service';
import { RoomsService } from '../../services/rooms.service';

@Component({
  selector: 'app-room-settings',
  templateUrl: './room-settings.page.html',
  styleUrls: ['./room-settings.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonInput,
    IonTextarea,
    IonToggle,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonBadge,
    IonSelect,
    IonSelectOption,
    IonSearchbar,
    IonSpinner,
  ],
})
export class RoomSettingsPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly roomsService = inject(RoomsService);
  private readonly directoryService = inject(DirectoryService);
  private readonly presenceService = inject(PresenceService);
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly searchingCandidates = signal(false);
  readonly room = signal<ChatRoom | null>(null);
  readonly members = signal<RoomMember[]>([]);
  readonly myMembership = signal<RoomMember | null>(null);
  readonly candidates = signal<UserProfile[]>([]);
  readonly currentUid = signal<string>('');
  readonly presenceMap = this.presenceService.presenceMap;

  readonly isAdmin = computed(() => this.myMembership()?.role === 'admin');
  readonly canEditInfo = computed(() => {
    const role = this.myMembership()?.role;
    return this.room()?.room_type !== 'direct' && (role === 'admin' || role === 'moderator');
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(240)]],
    is_private: [true],
  });

  private roomId = '';
  private unsubPresence: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    this.unsubPresence = this.presenceService.subscribeAllPresence();
    this.roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
    const user = await this.firebaseClient.waitForAuthReady();
    if (!user || !this.roomId) {
      await this.router.navigateByUrl('/rooms', { replaceUrl: true });
      return;
    }
    this.currentUid.set(user.uid);
    await this.loadRoomData();
  }

  ngOnDestroy(): void {
    this.unsubPresence?.();
  }

  async loadRoomData(): Promise<void> {
    this.loading.set(true);
    try {
      const [room, members, membership] = await Promise.all([
        this.roomsService.getRoomById(this.roomId),
        this.roomsService.getRoomMembers(this.roomId),
        this.roomsService.getMyMembership(this.roomId),
      ]);

      if (!room) {
        await this.showToast('La sala no existe.', 'warning');
        await this.router.navigateByUrl('/rooms', { replaceUrl: true });
        return;
      }

      this.room.set(room);
      this.members.set(members);
      this.myMembership.set(membership);
      this.form.patchValue({
        name: room.name,
        description: room.description,
        is_private: room.is_private,
      });

      if (membership?.role === 'admin' && room.room_type !== 'direct') {
        await this.searchAddCandidates('');
      }
    } catch {
      await this.showToast('No se pudieron cargar los ajustes de la sala.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  async onSaveRoom(): Promise<void> {
    if (!this.canEditInfo() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const updated = await this.roomsService.updateRoomDetails(this.roomId, {
        name: raw.name,
        description: raw.description,
        is_private: raw.is_private,
      });
      this.room.set(updated);
      await this.showToast('Informacion de sala actualizada.', 'success');
    } catch {
      await this.showToast('No se pudo actualizar la sala.', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async onToggleMute(event: CustomEvent): Promise<void> {
    const checked = Boolean((event.detail as { checked?: boolean }).checked);
    const current = this.myMembership();
    if (!current) {
      return;
    }

    try {
      await this.roomsService.toggleMute(this.roomId, checked);
      this.myMembership.set({ ...current, is_muted: checked });
      await this.showToast(checked ? 'Sala silenciada.' : 'Notificaciones activadas.', 'primary');
    } catch {
      await this.showToast('No se pudo cambiar el estado de silencio.', 'danger');
    }
  }

  async onRoleChange(member: RoomMember, event: CustomEvent): Promise<void> {
    const role = (event.detail as { value?: RoomRole }).value;
    if (!role || role === member.role) {
      return;
    }

    try {
      const updated = await this.roomsService.updateMemberRole(this.roomId, member.user_uid, role);
      this.members.update((list) =>
        list.map((item) => (item.user_uid === member.user_uid ? { ...item, role: updated.role } : item)),
      );
      await this.showToast('Rol actualizado.', 'success');
    } catch {
      await this.showToast('No se pudo cambiar el rol.', 'danger');
    }
  }

  async confirmRemoveMember(member: RoomMember): Promise<void> {
    const name = member.profile?.display_name ?? member.user_uid;
    const alert = await this.alertCtrl.create({
      header: 'Expulsar miembro',
      message: `Quitar a ${name} de esta sala?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Quitar',
          role: 'destructive',
          handler: () => {
            void this.removeMember(member.user_uid);
          },
        },
      ],
    });
    await alert.present();
  }

  async onSearchCandidates(event: CustomEvent): Promise<void> {
    const query = (event.detail as { value?: string | null }).value ?? '';
    await this.searchAddCandidates(query);
  }

  async addCandidate(user: UserProfile): Promise<void> {
    try {
      await this.roomsService.addMembers(this.roomId, [user.firebase_uid], 'member');
      const members = await this.roomsService.getRoomMembers(this.roomId);
      this.members.set(members);
      this.candidates.update((list) => list.filter((item) => item.firebase_uid !== user.firebase_uid));
      await this.showToast(`${user.display_name} agregado a la sala.`, 'success');
    } catch {
      await this.showToast('No se pudo agregar el miembro.', 'danger');
    }
  }

  async confirmLeaveRoom(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Salir de la sala',
      message: 'Dejaras de recibir mensajes de esta conversacion.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Salir',
          role: 'destructive',
          handler: () => {
            void this.leaveRoom();
          },
        },
      ],
    });
    await alert.present();
  }

  async openChat(): Promise<void> {
    await this.router.navigate(['/chat', this.roomId]);
  }

  isMemberOnline(member: RoomMember): boolean {
    const live = this.presenceMap()[member.user_uid];
    if (live) {
      return live.isOnline;
    }
    return Boolean(member.profile?.is_online);
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  getRoleColor(role: RoomRole): string {
    if (role === 'admin') {
      return 'primary';
    }
    if (role === 'moderator') {
      return 'tertiary';
    }
    return 'medium';
  }

  private async removeMember(uid: string): Promise<void> {
    try {
      await this.roomsService.removeMember(this.roomId, uid);
      this.members.update((list) => list.filter((item) => item.user_uid !== uid));
      await this.showToast('Miembro eliminado de la sala.', 'primary');
    } catch {
      await this.showToast('No se pudo eliminar el miembro.', 'danger');
    }
  }

  private async leaveRoom(): Promise<void> {
    try {
      await this.roomsService.leaveRoom(this.roomId);
      await this.router.navigateByUrl('/rooms', { replaceUrl: true });
    } catch {
      await this.showToast('No se pudo salir de la sala.', 'danger');
    }
  }

  private async searchAddCandidates(query: string): Promise<void> {
    this.searchingCandidates.set(true);
    try {
      const existingUids = new Set(this.members().map((member) => member.user_uid));
      const results = await this.directoryService.searchUsers(query, { limit: 20 });
      this.candidates.set(results.filter((user) => !existingUids.has(user.firebase_uid)));
    } catch {
      await this.showToast('No se pudo consultar el directorio.', 'danger');
    } finally {
      this.searchingCandidates.set(false);
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
