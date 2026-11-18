import { CommonModule } from '@angular/common';
import type { ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import {
  AlertController,
  IonAvatar,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Unsubscribe } from 'firebase/firestore';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowRedoOutline,
  arrowUndoOutline,
  attachOutline,
  banOutline,
  cameraOutline,
  chatbubbleEllipsesOutline,
  checkmarkDoneOutline,
  checkmarkOutline,
  closeOutline,
  createOutline,
  documentTextOutline,
  ellipsisHorizontalOutline,
  happyOutline,
  imagesOutline,
  locationOutline,
  megaphoneOutline,
  micOutline,
  peopleOutline,
  pinOutline,
  searchOutline,
  send,
  settingsOutline,
  statsChartOutline,
  trashOutline,
} from 'ionicons/icons';

import type { ReplyToRef } from '../../../../core/models/chat-message.model';
import type { ChatRoom, RoomMember } from '../../../../core/models/chat-room.model';
import type { ChatPoll } from '../../../../core/models/poll.model';
import type { UserPresence } from '../../../../core/models/user-profile.model';
import { FirebaseClientService } from '../../../../core/services/firebase-client.service';
import { SupabaseClientService } from '../../../../core/services/supabase-client.service';
import {
  ShareLocationModalComponent,
  type ShareLocationResult,
} from '../../../location/components/share-location-modal/share-location-modal.component';
import { LocationService } from '../../../location/services/location.service';
import { MediaGalleryModalComponent } from '../../../media/components/media-gallery-modal/media-gallery-modal.component';
import {
  VoiceRecorderComponent,
  type VoiceRecordingResult,
} from '../../../media/components/voice-recorder/voice-recorder.component';
import { ACCEPTED_DOCUMENT_TYPES, MediaService } from '../../../media/services/media.service';
import { CreatePollModalComponent } from '../../../polls/components/create-poll-modal/create-poll-modal.component';
import { MessageSearchBarComponent } from '../../../polls/components/message-search-bar/message-search-bar.component';
import { PinnedMessageBannerComponent } from '../../../polls/components/pinned-message-banner/pinned-message-banner.component';
import { PresenceService } from '../../../rooms/services/presence.service';
import { ForwardModalComponent } from '../../components/forward-modal/forward-modal.component';
import { MessageBubbleComponent } from '../../components/message-bubble/message-bubble.component';
import { ChatService, type ExtendedChatMessage } from '../../services/chat.service';
import { TypingService, type TypingUser } from '../../services/typing.service';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.page.html',
  styleUrls: ['./chat-room.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonAvatar,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonFooter,
    IonTextarea,
    IonSpinner,
    IonText,
    MessageBubbleComponent,
    MessageSearchBarComponent,
    PinnedMessageBannerComponent,
    VoiceRecorderComponent,
  ],
})
export class ChatRoomPage implements OnInit, OnDestroy {
  @ViewChild('chatContent') chatContent?: IonContent;
  @ViewChild('imageInput') imageInput?: ElementRef<HTMLInputElement>;
  @ViewChild('docInput') docInput?: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly supabaseClient = inject(SupabaseClientService);
  private readonly chatService = inject(ChatService);
  private readonly typingService = inject(TypingService);
  private readonly mediaService = inject(MediaService);
  private readonly locationService = inject(LocationService);
  private readonly presenceService = inject(PresenceService);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly acceptedDocTypes = ACCEPTED_DOCUMENT_TYPES;

  readonly roomId = signal('');
  readonly currentUid = signal('');
  readonly currentDisplayName = signal('Usuario');
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly uploadingMedia = signal(false);

  readonly room = signal<ChatRoom | null>(null);
  readonly members = signal<RoomMember[]>([]);
  readonly messages = signal<ExtendedChatMessage[]>([]);
  readonly typingUsers = signal<TypingUser[]>([]);
  readonly peerPresence = signal<UserPresence | null>(null);

  readonly draftText = signal('');
  readonly replyingTo = signal<ReplyToRef | null>(null);
  readonly editingMessage = signal<ExtendedChatMessage | null>(null);
  readonly showAttachments = signal(false);
  readonly showVoiceRecorder = signal(false);
  readonly showSearch = signal(false);
  readonly searchMatches = signal<string[]>([]);
  readonly highlightedMessageId = signal<string | null>(null);

  readonly peerMember = computed(() => {
    const r = this.room();
    const uid = this.currentUid();
    if (!r || r.room_type !== 'direct') {
      return null;
    }
    return this.members().find((m) => m.user_uid !== uid) ?? null;
  });

  readonly displayRoomName = computed(() => {
    const peer = this.peerMember();
    if (peer?.profile?.display_name) {
      return peer.profile.display_name;
    }
    return this.room()?.name || 'Sala de chat';
  });

  readonly displayAvatar = computed(() => {
    const peer = this.peerMember();
    if (peer?.profile?.avatar_url) {
      return peer.profile.avatar_url;
    }
    return this.room()?.avatar_url ?? null;
  });

  readonly subtitleText = computed(() => {
    const typing = this.typingUsers();
    if (typing.length === 1) {
      return `${typing[0].displayName} esta escribiendo...`;
    }
    if (typing.length > 1) {
      return `${typing.length} personas escribiendo...`;
    }
    const peer = this.peerMember();
    if (peer) {
      const live = this.peerPresence();
      if (live) {
        return this.presenceService.formatLastSeen(live.lastSeen, live.isOnline);
      }
      if (peer.profile) {
        return this.presenceService.formatLastSeen(peer.profile.last_seen, peer.profile.is_online);
      }
    }
    const count = this.members().length;
    return count === 1 ? '1 miembro' : `${count} miembros`;
  });

  readonly myMembership = computed(() => {
    const uid = this.currentUid();
    return this.members().find((m) => m.user_uid === uid) ?? null;
  });

  readonly canPinMessages = computed(() => {
    const r = this.room();
    const uid = this.currentUid();
    if (!r || !uid) {
      return false;
    }
    if (r.room_type === 'direct' || r.created_by === uid) {
      return true;
    }
    const role = this.myMembership()?.role;
    return role === 'admin' || role === 'moderator';
  });

  readonly pinnedMessage = computed(() => {
    const pinnedId = this.room()?.pinned_message_id;
    if (!pinnedId) {
      return null;
    }
    const found = this.messages().find((m) => m.id === pinnedId && !m.isDeleted);
    return found ?? null;
  });

  private unsubMessages?: Unsubscribe;
  private unsubTyping?: Unsubscribe;
  private unsubPresence?: Unsubscribe;
  private roomChannel?: RealtimeChannel;
  private highlightTimer?: ReturnType<typeof setTimeout>;
  private initialScrollDone = false;

  constructor() {
    addIcons({
      addOutline,
      arrowRedoOutline,
      arrowUndoOutline,
      attachOutline,
      banOutline,
      cameraOutline,
      chatbubbleEllipsesOutline,
      checkmarkDoneOutline,
      checkmarkOutline,
      closeOutline,
      createOutline,
      documentTextOutline,
      ellipsisHorizontalOutline,
      happyOutline,
      imagesOutline,
      locationOutline,
      megaphoneOutline,
      micOutline,
      peopleOutline,
      pinOutline,
      searchOutline,
      send,
      settingsOutline,
      statsChartOutline,
      trashOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('roomId') ?? '';
    if (!id) {
      await this.router.navigateByUrl('/rooms', { replaceUrl: true });
      return;
    }
    this.roomId.set(id);

    const user = await this.firebaseClient.waitForAuthReady();
    if (!user) {
      await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
      return;
    }

    this.currentUid.set(user.uid);
    this.currentDisplayName.set(user.displayName || user.email?.split('@')[0] || 'Usuario');

    await this.loadRoomContext(id, user.uid);
    this.subscribeRealtime(id, user.uid);
    await this.chatService.resetUnreadCount(id, user.uid);
  }

  ngOnDestroy(): void {
    const id = this.roomId();
    const uid = this.currentUid();
    if (id && uid) {
      void this.typingService.stopTyping(id, uid, this.currentDisplayName());
    }
    this.unsubMessages?.();
    this.unsubTyping?.();
    this.unsubPresence?.();
    if (this.roomChannel) {
      void this.supabaseClient.client.removeChannel(this.roomChannel);
    }
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
    }
  }

  onDraftInput(event: CustomEvent): void {
    const value = (event.detail as { value?: string | null }).value ?? '';
    this.draftText.set(value);

    const id = this.roomId();
    const uid = this.currentUid();
    if (!id || !uid || this.editingMessage()) {
      return;
    }

    if (value.trim().length > 0) {
      this.typingService.notifyTyping(id, uid, this.currentDisplayName());
    } else {
      void this.typingService.stopTyping(id, uid, this.currentDisplayName());
    }
  }

  onEnterKey(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    void this.onSubmitText();
  }

  async onSubmitText(): Promise<void> {
    const text = this.draftText().trim();
    const id = this.roomId();
    const uid = this.currentUid();
    if (!text || !id || !uid || this.sending()) {
      return;
    }

    const editing = this.editingMessage();
    this.sending.set(true);

    try {
      if (editing?.id) {
        await this.chatService.editMessage(id, editing.id, text);
        this.editingMessage.set(null);
        this.draftText.set('');
      } else {
        const reply = this.replyingTo();
        this.draftText.set('');
        this.replyingTo.set(null);
        void this.typingService.stopTyping(id, uid, this.currentDisplayName());
        await this.chatService.sendMessage(id, {
          type: 'text',
          text,
          replyTo: reply,
        });
        this.scrollToBottom(true);
      }
    } catch {
      await this.showToast('No se pudo enviar el mensaje.', 'danger');
    } finally {
      this.sending.set(false);
    }
  }

  onStartReply(message: ExtendedChatMessage): void {
    if (!message.id) {
      return;
    }
    this.editingMessage.set(null);
    this.replyingTo.set({
      messageId: message.id,
      senderUid: message.senderUid,
      senderName: message.senderName,
      previewText: this.chatService.buildPreviewText(message),
    });
  }

  onStartEdit(message: ExtendedChatMessage): void {
    if (!message.id || message.senderUid !== this.currentUid()) {
      return;
    }
    this.replyingTo.set(null);
    this.editingMessage.set(message);
    this.draftText.set(message.text);
  }

  cancelReplyOrEdit(): void {
    this.replyingTo.set(null);
    if (this.editingMessage()) {
      this.editingMessage.set(null);
      this.draftText.set('');
    }
  }

  async onConfirmDelete(message: ExtendedChatMessage): Promise<void> {
    const id = this.roomId();
    if (!id || !message.id || message.senderUid !== this.currentUid()) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar mensaje',
      message: 'El mensaje se marcara como eliminado para todos.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            void this.executeDelete(id, message.id!);
          },
        },
      ],
    });
    await alert.present();
  }

  async onToggleReaction(event: { message: ExtendedChatMessage; emoji: string }): Promise<void> {
    const id = this.roomId();
    const uid = this.currentUid();
    if (!id || !uid || !event.message.id) {
      return;
    }
    try {
      await this.chatService.toggleReaction(id, event.message.id, event.emoji, uid);
    } catch {
      await this.showToast('No se pudo registrar la reaccion.', 'danger');
    }
  }

  async onTogglePin(message: ExtendedChatMessage): Promise<void> {
    const id = this.roomId();
    if (!id || !message.id) {
      return;
    }
    const isAlreadyPinned = this.room()?.pinned_message_id === message.id;
    const nextPinnedId = isAlreadyPinned ? null : message.id;

    try {
      await this.chatService.pinMessage(id, nextPinnedId);
      this.room.update((r) => (r ? { ...r, pinned_message_id: nextPinnedId } : r));
      await this.showToast(nextPinnedId ? 'Mensaje fijado en la sala.' : 'Mensaje desfijado.', 'primary');
    } catch {
      await this.showToast('No se pudo actualizar el mensaje fijado.', 'danger');
    }
  }

  async onUnpinCurrent(): Promise<void> {
    const id = this.roomId();
    if (!id) {
      return;
    }
    try {
      await this.chatService.pinMessage(id, null);
      this.room.update((r) => (r ? { ...r, pinned_message_id: null } : r));
    } catch {
      await this.showToast('No se pudo desfijar el mensaje.', 'danger');
    }
  }

  async onOpenForward(message: ExtendedChatMessage): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ForwardModalComponent,
      componentProps: {
        currentRoomId: this.roomId(),
        currentUid: this.currentUid(),
        messagePreview: this.chatService.buildPreviewText(message),
      },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<ChatRoom | null>();
    if (role !== 'confirm' || !data) {
      return;
    }

    try {
      await this.chatService.forwardMessage(data.id, message, this.displayRoomName());
      await this.showToast(`Mensaje reenviado a ${data.name}.`, 'success');
    } catch {
      await this.showToast('No se pudo reenviar el mensaje.', 'danger');
    }
  }

  toggleAttachments(): void {
    this.showAttachments.update((v) => !v);
    if (this.showAttachments()) {
      this.showVoiceRecorder.set(false);
    }
  }

  openVoiceRecorder(): void {
    this.showAttachments.set(false);
    this.showVoiceRecorder.set(true);
  }

  async onPickImage(): Promise<void> {
    this.showAttachments.set(false);
    if (Capacitor.isNativePlatform()) {
      await this.handleNativePhoto();
      return;
    }
    this.imageInput?.nativeElement.click();
  }

  onPickDocument(): void {
    this.showAttachments.set(false);
    this.docInput?.nativeElement.click();
  }

  async onWebImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    await this.uploadAndSendMedia(file, 'image');
  }

  async onWebDocSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    await this.uploadAndSendMedia(file, 'document');
  }

  async onVoiceRecorded(result: VoiceRecordingResult): Promise<void> {
    this.showVoiceRecorder.set(false);
    const id = this.roomId();
    const uid = this.currentUid();
    if (!id || !uid) {
      return;
    }

    this.uploadingMedia.set(true);
    try {
      const media = await this.mediaService.uploadVoiceNote(
        id,
        uid,
        result.blob,
        result.mimeType,
        result.durationSeconds,
      );
      const sent = await this.chatService.sendMessage(id, {
        type: 'audio',
        text: '',
        mediaId: media.id,
        mediaUrl: media.public_url,
        fileName: media.file_name,
        mimeType: media.mime_type,
        fileSize: media.file_size,
        durationSeconds: result.durationSeconds,
        replyTo: this.replyingTo(),
      });
      this.replyingTo.set(null);
      if (sent.id) {
        await this.mediaService.linkMediaToMessage(media.id, sent.id);
      }
      this.scrollToBottom(true);
    } catch {
      await this.showToast('No se pudo enviar la nota de voz.', 'danger');
    } finally {
      this.uploadingMedia.set(false);
    }
  }

  async openShareLocation(): Promise<void> {
    this.showAttachments.set(false);
    const id = this.roomId();
    const uid = this.currentUid();
    if (!id || !uid) {
      return;
    }

    const modal = await this.modalCtrl.create({
      component: ShareLocationModalComponent,
      componentProps: {
        roomId: id,
        senderUid: uid,
        saveOnConfirm: true,
      },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<ShareLocationResult | null>();
    if (role !== 'confirm' || !data) {
      return;
    }

    this.sending.set(true);
    try {
      const sent = await this.chatService.sendMessage(id, {
        type: 'location',
        text: data.label || 'Ubicacion compartida',
        locationId: data.location?.id,
        latitude: data.latitude,
        longitude: data.longitude,
        locationLabel: data.label ?? undefined,
        accuracy: data.accuracy ?? undefined,
        replyTo: this.replyingTo(),
      });
      this.replyingTo.set(null);
      if (data.location?.id && sent.id) {
        await this.locationService.updateLocationMessageId(data.location.id, sent.id);
      }
      this.scrollToBottom(true);
    } catch {
      await this.showToast('No se pudo compartir la ubicacion.', 'danger');
    } finally {
      this.sending.set(false);
    }
  }

  async openCreatePoll(): Promise<void> {
    this.showAttachments.set(false);
    const id = this.roomId();
    if (!id) {
      return;
    }

    const modal = await this.modalCtrl.create({
      component: CreatePollModalComponent,
      componentProps: { roomId: id },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<ChatPoll | null>();
    if (role !== 'created' || !data) {
      return;
    }

    this.sending.set(true);
    try {
      await this.chatService.sendMessage(id, {
        type: 'poll',
        text: data.question,
        pollId: data.id,
        replyTo: this.replyingTo(),
      });
      this.replyingTo.set(null);
      this.scrollToBottom(true);
    } catch {
      await this.showToast('No se pudo enviar la encuesta.', 'danger');
    } finally {
      this.sending.set(false);
    }
  }

  async openMediaGallery(): Promise<void> {
    const id = this.roomId();
    if (!id) {
      return;
    }
    const modal = await this.modalCtrl.create({
      component: MediaGalleryModalComponent,
      componentProps: {
        roomId: id,
        roomName: this.displayRoomName(),
      },
    });
    await modal.present();
  }

  async goToRoomSettings(): Promise<void> {
    const id = this.roomId();
    if (id) {
      await this.router.navigate(['/rooms', id, 'settings']);
    }
  }

  toggleSearch(): void {
    this.showSearch.update((v) => !v);
    if (!this.showSearch()) {
      this.searchMatches.set([]);
      this.highlightedMessageId.set(null);
    }
  }

  closeSearch(): void {
    this.showSearch.set(false);
    this.searchMatches.set([]);
    this.highlightedMessageId.set(null);
  }

  onSearchMatches(ids: string[]): void {
    this.searchMatches.set(ids);
  }

  onActiveSearchMatch(messageId: string | null): void {
    if (messageId) {
      this.scrollToMessage(messageId);
    }
  }

  scrollToMessage(messageId: string): void {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    this.highlightedMessageId.set(messageId);
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
    }
    this.highlightTimer = setTimeout(() => {
      this.highlightedMessageId.set(null);
    }, 2200);
  }

  private async loadRoomContext(roomId: string, uid: string): Promise<void> {
    this.loading.set(true);
    try {
      const [roomDetails, roomMembers] = await Promise.all([
        this.chatService.getRoomDetails(roomId),
        this.chatService.getRoomMembers(roomId),
      ]);
      this.room.set(roomDetails);
      this.members.set(roomMembers);

      if (roomDetails?.room_type === 'direct') {
        const peer = roomMembers.find((m) => m.user_uid !== uid);
        if (peer) {
          this.unsubPresence = this.presenceService.watchUserPresence(peer.user_uid, (presence) => {
            this.peerPresence.set(presence);
          });
        }
      }
    } catch {
      await this.showToast('Error al cargar los datos de la sala.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  private subscribeRealtime(roomId: string, uid: string): void {
    this.unsubMessages = this.chatService.subscribeToMessages(
      roomId,
      (items) => {
        this.messages.set(items);
        void this.chatService.markMessagesAsRead(roomId, items, uid);
        if (!this.initialScrollDone) {
          this.initialScrollDone = true;
          this.scrollToBottom(false);
        }
      },
      () => {
        void this.showToast('Error al sincronizar mensajes en vivo.', 'danger');
      },
    );

    this.unsubTyping = this.typingService.subscribeToTyping(roomId, uid, (users) => {
      this.typingUsers.set(users);
    });

    this.roomChannel = this.supabaseClient.client
      .channel(`room-meta-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as ChatRoom;
          if (updated?.id === roomId) {
            this.room.set(updated);
          }
        },
      )
      .subscribe();
  }

  private async handleNativePhoto(): Promise<void> {
    const id = this.roomId();
    const uid = this.currentUid();
    if (!id || !uid) {
      return;
    }

    this.uploadingMedia.set(true);
    try {
      const picked = await this.mediaService.capturePhoto(CameraSource.Prompt);
      if (!picked) {
        return;
      }
      const media = await this.mediaService.uploadImage(id, uid, picked.blob, picked.fileName, picked.mimeType);
      const sent = await this.chatService.sendMessage(id, {
        type: 'image',
        text: '',
        mediaId: media.id,
        mediaUrl: media.public_url,
        fileName: media.file_name,
        mimeType: media.mime_type,
        fileSize: media.file_size,
        replyTo: this.replyingTo(),
      });
      this.replyingTo.set(null);
      if (sent.id) {
        await this.mediaService.linkMediaToMessage(media.id, sent.id);
      }
      this.scrollToBottom(true);
    } catch {
      await this.showToast('No se pudo enviar la imagen.', 'danger');
    } finally {
      this.uploadingMedia.set(false);
    }
  }

  private async uploadAndSendMedia(file: File, forcedType: 'image' | 'document'): Promise<void> {
    const id = this.roomId();
    const uid = this.currentUid();
    if (!id || !uid) {
      return;
    }

    this.uploadingMedia.set(true);
    try {
      const prepared = this.mediaService.prepareWebFile(file, forcedType);
      const media =
        forcedType === 'image'
          ? await this.mediaService.uploadImage(id, uid, prepared.blob, prepared.fileName, prepared.mimeType)
          : await this.mediaService.uploadDocument(id, uid, prepared.blob, prepared.fileName, prepared.mimeType);

      const sent = await this.chatService.sendMessage(id, {
        type: forcedType,
        text: '',
        mediaId: media.id,
        mediaUrl: media.public_url,
        fileName: media.file_name,
        mimeType: media.mime_type,
        fileSize: media.file_size,
        replyTo: this.replyingTo(),
      });
      this.replyingTo.set(null);
      if (sent.id) {
        await this.mediaService.linkMediaToMessage(media.id, sent.id);
      }
      this.scrollToBottom(true);
    } catch {
      await this.showToast('No se pudo subir el archivo adjunto.', 'danger');
    } finally {
      this.uploadingMedia.set(false);
    }
  }

  private async executeDelete(roomId: string, messageId: string): Promise<void> {
    try {
      await this.chatService.deleteMessage(roomId, messageId);
    } catch {
      await this.showToast('No se pudo eliminar el mensaje.', 'danger');
    }
  }

  private scrollToBottom(smooth: boolean): void {
    setTimeout(() => {
      void this.chatContent?.scrollToBottom(smooth ? 250 : 0);
    }, 80);
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
