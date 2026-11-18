import { CommonModule } from '@angular/common';
import type { OnInit } from '@angular/core';
import { Component, Input, computed, inject, signal } from '@angular/core';
import {
  IonAvatar,
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
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';

import type { ChatRoom } from '../../../../core/models/chat-room.model';
import { FirebaseClientService } from '../../../../core/services/firebase-client.service';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-forward-modal',
  templateUrl: './forward-modal.component.html',
  styleUrls: ['./forward-modal.component.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonSpinner,
    IonText,
  ],
})
export class ForwardModalComponent implements OnInit {
  @Input() currentRoomId = '';
  @Input() currentUid = '';
  @Input() messagePreview = '';

  private readonly chatService = inject(ChatService);
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly modalCtrl = inject(ModalController);

  readonly loading = signal(true);
  readonly rooms = signal<ChatRoom[]>([]);
  readonly searchTerm = signal('');

  readonly filteredRooms = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    return this.rooms().filter((room) => {
      if (room.id === this.currentRoomId) {
        return false;
      }
      if (!query) {
        return true;
      }
      return room.name.toLowerCase().includes(query);
    });
  });

  async ngOnInit(): Promise<void> {
    const uid = this.currentUid || this.firebaseClient.auth.currentUser?.uid || '';
    if (!uid) {
      this.loading.set(false);
      return;
    }

    try {
      const list = await this.chatService.getUserRooms(uid);
      this.rooms.set(list);
    } catch {
      this.rooms.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(event: CustomEvent): void {
    const value = (event.detail as { value?: string }).value ?? '';
    this.searchTerm.set(value);
  }

  async selectRoom(room: ChatRoom): Promise<void> {
    await this.modalCtrl.dismiss(room, 'confirm');
  }

  async close(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  roomIcon(room: ChatRoom): string {
    if (room.room_type === 'channel') {
      return 'megaphone-outline';
    }
    if (room.room_type === 'group') {
      return 'people-outline';
    }
    return 'chatbubble-ellipses-outline';
  }
}
