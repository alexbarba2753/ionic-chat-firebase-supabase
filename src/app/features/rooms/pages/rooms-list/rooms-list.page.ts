import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonAvatar,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';

import type { ChatRoom } from '../../../../core/models/chat-room.model';
import { PresenceService } from '../../services/presence.service';
import { RoomsService, type UserRoomSummary } from '../../services/rooms.service';

@Component({
  selector: 'app-rooms-list',
  templateUrl: './rooms-list.page.html',
  styleUrls: ['./rooms-list.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonItem,
    IonAvatar,
    IonBadge,
    IonNote,
    IonSpinner,
  ],
})
export class RoomsListPage implements OnInit, OnDestroy {
  private readonly roomsService = inject(RoomsService);
  private readonly presenceService = inject(PresenceService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly activeTab = signal<'mine' | 'channels'>('mine');
  readonly searchTerm = signal('');
  readonly myRooms = signal<UserRoomSummary[]>([]);
  readonly publicChannels = signal<ChatRoom[]>([]);
  readonly joiningRoomId = signal<string | null>(null);

  readonly presenceMap = this.presenceService.presenceMap;

  readonly filteredRooms = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const list = this.myRooms();
    if (!query) {
      return list;
    }
    return list.filter((item) => {
      const displayName = this.getRoomDisplayName(item).toLowerCase();
      const lastText = (item.room.last_message_text ?? '').toLowerCase();
      return displayName.includes(query) || lastText.includes(query);
    });
  });

  readonly filteredChannels = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const joinedIds = new Set(this.myRooms().map((item) => item.room.id));
    return this.publicChannels()
      .filter((channel) => {
        if (!query) {
          return true;
        }
        return channel.name.toLowerCase().includes(query) || channel.description.toLowerCase().includes(query);
      })
      .map((channel) => ({
        channel,
        joined: joinedIds.has(channel.id),
      }));
  });

  private unsubPresence: (() => void) | null = null;
  private unsubRealtime: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    this.presenceService.startLifecycleTracking();
    this.unsubPresence = this.presenceService.subscribeAllPresence();
    this.unsubRealtime = this.roomsService.subscribeRoomsUpdates(() => {
      void this.loadData(false);
    });
    await this.loadData(true);
  }

  async ionViewWillEnter(): Promise<void> {
    await this.loadData(false);
  }

  ngOnDestroy(): void {
    this.unsubPresence?.();
    this.unsubRealtime?.();
  }

  async loadData(showLoader: boolean): Promise<void> {
    if (showLoader) {
      this.loading.set(true);
    }
    try {
      const [rooms, channels] = await Promise.all([
        this.roomsService.listUserRooms(),
        this.roomsService.listPublicChannels(),
      ]);
      this.myRooms.set(rooms);
      this.publicChannels.set(channels);
    } catch {
      await this.showToast('No se pudieron cargar las salas.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  async onRefresh(event: CustomEvent): Promise<void> {
    await this.loadData(false);
    await (event.target as HTMLIonRefresherElement).complete();
  }

  onSearchInput(event: CustomEvent): void {
    const value = (event.detail as { value?: string | null }).value ?? '';
    this.searchTerm.set(value);
  }

  onTabChange(event: CustomEvent): void {
    const value = (event.detail as { value?: string }).value;
    if (value === 'mine' || value === 'channels') {
      this.activeTab.set(value);
    }
  }

  async openRoom(summary: UserRoomSummary): Promise<void> {
    if (summary.membership.unread_count > 0) {
      void this.roomsService.resetUnreadCount(summary.room.id).catch(() => undefined);
    }
    await this.router.navigate(['/chat', summary.room.id]);
  }

  async openSettings(roomId: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.router.navigate(['/rooms', roomId, 'settings']);
  }

  async joinChannel(channel: ChatRoom): Promise<void> {
    this.joiningRoomId.set(channel.id);
    try {
      await this.roomsService.joinPublicChannel(channel.id);
      await this.loadData(false);
      await this.router.navigate(['/chat', channel.id]);
    } catch {
      await this.showToast('No se pudo unir al canal.', 'danger');
    } finally {
      this.joiningRoomId.set(null);
    }
  }

  async openChannel(channel: ChatRoom): Promise<void> {
    await this.router.navigate(['/chat', channel.id]);
  }

  getRoomDisplayName(summary: UserRoomSummary): string {
    if (summary.room.room_type === 'direct' && summary.directPeer) {
      return summary.directPeer.display_name;
    }
    return summary.room.name;
  }

  getRoomAvatar(summary: UserRoomSummary): string | null {
    if (summary.room.room_type === 'direct' && summary.directPeer) {
      return summary.directPeer.avatar_url;
    }
    return summary.room.avatar_url;
  }

  getRoomInitials(summary: UserRoomSummary): string {
    const label = this.getRoomDisplayName(summary).trim();
    if (!label) {
      return 'C';
    }
    return label
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  isDirectPeerOnline(summary: UserRoomSummary): boolean {
    if (summary.room.room_type !== 'direct' || !summary.directPeer) {
      return false;
    }
    const live = this.presenceMap()[summary.directPeer.firebase_uid];
    return live ? live.isOnline : summary.directPeer.is_online;
  }

  formatTimestamp(isoDate: string | undefined): string {
    if (!isoDate) {
      return '';
    }
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const now = new Date();
    const isSameDay =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    return isSameDay
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
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
