import { Injectable, inject } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

import type { ChatMessage, MessageReaction, MessageType, ReplyToRef } from '../../../core/models/chat-message.model';
import type { ChatRoom, RoomMember } from '../../../core/models/chat-room.model';
import { FirebaseClientService } from '../../../core/services/firebase-client.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export interface ExtendedChatMessage extends ChatMessage {
  accuracy?: number;
  isLive?: boolean;
  isForwarded?: boolean;
  forwardedFrom?: string;
}

export interface SendMessageInput {
  type: MessageType;
  text: string;
  mediaId?: string;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  durationSeconds?: number;
  locationId?: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  accuracy?: number;
  isLive?: boolean;
  pollId?: string;
  replyTo?: ReplyToRef | null;
  isForwarded?: boolean;
  forwardedFrom?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly supabaseClient = inject(SupabaseClientService);

  subscribeToMessages(
    roomId: string,
    onMessages: (messages: ExtendedChatMessage[]) => void,
    onError?: (error: unknown) => void,
  ): Unsubscribe {
    const messagesRef = collection(this.firebaseClient.firestore, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const items: ExtendedChatMessage[] = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as ExtendedChatMessage),
          id: docSnap.id,
        }));
        onMessages(items);
      },
      (error) => {
        onError?.(error);
      },
    );
  }

  async getRoomDetails(roomId: string): Promise<ChatRoom | null> {
    const { data, error } = await this.supabaseClient.client
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as ChatRoom | null) ?? null;
  }

  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    const { data, error } = await this.supabaseClient.client
      .from('room_members')
      .select('*, profile:profiles(*)')
      .eq('room_id', roomId);

    if (error) {
      throw error;
    }

    return (data as RoomMember[]) ?? [];
  }

  async getUserRooms(uid: string): Promise<ChatRoom[]> {
    const { data, error } = await this.supabaseClient.client
      .from('room_members')
      .select('room:chat_rooms(*)')
      .eq('user_uid', uid);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as unknown as { room: ChatRoom | null }[];
    return rows
      .map((row) => row.room)
      .filter((room): room is ChatRoom => room !== null)
      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
  }

  async sendMessage(roomId: string, input: SendMessageInput): Promise<ExtendedChatMessage> {
    const user = this.firebaseClient.auth.currentUser;
    if (!user) {
      throw new Error('Usuario no autenticado');
    }

    const senderInfo = await this.resolveSenderInfo(user.uid, user.displayName, user.photoURL);
    const messagesRef = collection(this.firebaseClient.firestore, 'rooms', roomId, 'messages');
    const msgRef = doc(messagesRef);

    const payload: Record<string, unknown> = {
      id: msgRef.id,
      roomId,
      senderUid: user.uid,
      senderName: senderInfo.name,
      senderAvatar: senderInfo.avatar,
      type: input.type,
      text: (input.text ?? '').slice(0, 5000),
      reactions: {},
      readBy: [user.uid],
      isEdited: false,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (input.mediaId) {
      payload['mediaId'] = input.mediaId.slice(0, 128);
    }
    if (input.mediaUrl) {
      payload['mediaUrl'] = input.mediaUrl.slice(0, 2048);
    }
    if (input.fileName) {
      payload['fileName'] = input.fileName.slice(0, 255);
    }
    if (input.mimeType) {
      payload['mimeType'] = input.mimeType.slice(0, 128);
    }
    if (typeof input.fileSize === 'number') {
      payload['fileSize'] = input.fileSize;
    }
    if (typeof input.durationSeconds === 'number') {
      payload['durationSeconds'] = Math.min(Math.max(Math.round(input.durationSeconds), 0), 3600);
    }
    if (input.locationId) {
      payload['locationId'] = input.locationId.slice(0, 128);
    }
    if (typeof input.latitude === 'number') {
      payload['latitude'] = input.latitude;
    }
    if (typeof input.longitude === 'number') {
      payload['longitude'] = input.longitude;
    }
    if (input.locationLabel) {
      payload['locationLabel'] = input.locationLabel.slice(0, 300);
    }
    if (typeof input.accuracy === 'number') {
      payload['accuracy'] = input.accuracy;
    }
    if (typeof input.isLive === 'boolean') {
      payload['isLive'] = input.isLive;
    }
    if (input.pollId) {
      payload['pollId'] = input.pollId.slice(0, 128);
    }
    if (input.replyTo) {
      payload['replyTo'] = {
        messageId: input.replyTo.messageId.slice(0, 128),
        senderUid: input.replyTo.senderUid.slice(0, 128),
        senderName: input.replyTo.senderName.slice(0, 100),
        previewText: input.replyTo.previewText.slice(0, 1000),
      };
    }
    if (input.isForwarded) {
      payload['isForwarded'] = true;
    }
    if (input.forwardedFrom) {
      payload['forwardedFrom'] = input.forwardedFrom.slice(0, 128);
    }

    await setDoc(msgRef, payload);
    await this.syncRoomLastMessage(roomId, user.uid, input);

    return {
      ...(payload as unknown as ExtendedChatMessage),
      id: msgRef.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async editMessage(roomId: string, messageId: string, newText: string): Promise<void> {
    const cleanText = newText.trim().slice(0, 5000);
    if (!cleanText) {
      return;
    }
    const msgRef = doc(this.firebaseClient.firestore, 'rooms', roomId, 'messages', messageId);
    await updateDoc(msgRef, {
      text: cleanText,
      isEdited: true,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    const msgRef = doc(this.firebaseClient.firestore, 'rooms', roomId, 'messages', messageId);
    await updateDoc(msgRef, {
      isDeleted: true,
      text: 'Mensaje eliminado',
      updatedAt: serverTimestamp(),
    });
  }

  async markMessagesAsRead(roomId: string, messages: ExtendedChatMessage[], uid: string): Promise<void> {
    const unread = messages.filter((msg) => msg.id && msg.senderUid !== uid && !(msg.readBy ?? []).includes(uid));
    if (unread.length === 0) {
      return;
    }

    const chunks: ExtendedChatMessage[][] = [];
    for (let i = 0; i < unread.length; i += 400) {
      chunks.push(unread.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(this.firebaseClient.firestore);
      for (const msg of chunk) {
        if (!msg.id) {
          continue;
        }
        const msgRef = doc(this.firebaseClient.firestore, 'rooms', roomId, 'messages', msg.id);
        batch.update(msgRef, {
          readBy: arrayUnion(uid),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    await this.resetUnreadCount(roomId, uid);
  }

  async resetUnreadCount(roomId: string, uid: string): Promise<void> {
    try {
      await this.supabaseClient.client
        .from('room_members')
        .update({ unread_count: 0 })
        .eq('room_id', roomId)
        .eq('user_uid', uid);
    } catch {
      // ignora errores si la membresia ya no existe
    }
  }

  async toggleReaction(roomId: string, messageId: string, emoji: string, uid: string): Promise<void> {
    const msgRef = doc(this.firebaseClient.firestore, 'rooms', roomId, 'messages', messageId);

    await runTransaction(this.firebaseClient.firestore, async (tx) => {
      const snap = await tx.get(msgRef);
      if (!snap.exists()) {
        return;
      }

      const data = snap.data() as { reactions?: MessageReaction };
      const current: MessageReaction = { ...(data.reactions ?? {}) };
      const users = current[emoji] ?? [];

      if (users.includes(uid)) {
        const filtered = users.filter((item) => item !== uid);
        if (filtered.length > 0) {
          current[emoji] = filtered;
        } else {
          delete current[emoji];
        }
      } else {
        if (!current[emoji] && Object.keys(current).length >= 50) {
          return;
        }
        current[emoji] = [...users, uid];
      }

      tx.update(msgRef, {
        reactions: current,
        updatedAt: serverTimestamp(),
      });
    });
  }

  async forwardMessage(
    targetRoomId: string,
    original: ExtendedChatMessage,
    sourceLabel?: string,
  ): Promise<ExtendedChatMessage> {
    const origin = (sourceLabel || original.senderName || 'Chat').slice(0, 128);

    if (original.type === 'poll') {
      return this.sendMessage(targetRoomId, {
        type: 'text',
        text: `[Encuesta] ${original.text}`,
        isForwarded: true,
        forwardedFrom: origin,
      });
    }

    return this.sendMessage(targetRoomId, {
      type: original.type,
      text: original.text,
      mediaId: original.mediaId,
      mediaUrl: original.mediaUrl,
      fileName: original.fileName,
      mimeType: original.mimeType,
      fileSize: original.fileSize,
      durationSeconds: original.durationSeconds,
      locationId: original.locationId,
      latitude: original.latitude,
      longitude: original.longitude,
      locationLabel: original.locationLabel,
      accuracy: original.accuracy,
      isForwarded: true,
      forwardedFrom: origin,
    });
  }

  async pinMessage(roomId: string, messageId: string | null): Promise<void> {
    const { error } = await this.supabaseClient.client
      .from('chat_rooms')
      .update({
        pinned_message_id: messageId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId);

    if (error) {
      throw error;
    }
  }

  buildPreviewText(message: Pick<ExtendedChatMessage, 'type' | 'text' | 'fileName' | 'locationLabel'>): string {
    if (message.text.trim()) {
      return message.text.trim().slice(0, 140);
    }
    switch (message.type) {
      case 'image':
        return 'Imagen';
      case 'document':
        return message.fileName ? `Archivo: ${message.fileName}` : 'Documento';
      case 'audio':
        return 'Nota de voz';
      case 'location':
        return message.locationLabel || 'Ubicacion compartida';
      case 'poll':
        return 'Encuesta';
      default:
        return 'Mensaje';
    }
  }

  private async resolveSenderInfo(
    uid: string,
    fallbackName: string | null,
    fallbackAvatar: string | null,
  ): Promise<{ name: string; avatar: string | null }> {
    try {
      const { data } = await this.supabaseClient.client
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('firebase_uid', uid)
        .maybeSingle();

      const row = data as { display_name?: string; avatar_url?: string | null } | null;
      return {
        name: (row?.display_name || fallbackName || 'Usuario').slice(0, 100),
        avatar: (row?.avatar_url ?? fallbackAvatar ?? null)?.slice(0, 2048) ?? null,
      };
    } catch {
      return {
        name: (fallbackName || 'Usuario').slice(0, 100),
        avatar: fallbackAvatar ? fallbackAvatar.slice(0, 2048) : null,
      };
    }
  }

  private async syncRoomLastMessage(roomId: string, senderUid: string, input: SendMessageInput): Promise<void> {
    const nowIso = new Date().toISOString();
    const preview = this.buildPreviewText(input);

    try {
      await this.supabaseClient.client
        .from('chat_rooms')
        .update({
          last_message_text: preview,
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', roomId);

      const { data: members } = await this.supabaseClient.client
        .from('room_members')
        .select('user_uid, unread_count')
        .eq('room_id', roomId)
        .neq('user_uid', senderUid);

      const others = (members ?? []) as { user_uid: string; unread_count: number }[];
      await Promise.allSettled(
        others.map((member) =>
          this.supabaseClient.client
            .from('room_members')
            .update({ unread_count: (member.unread_count ?? 0) + 1 })
            .eq('room_id', roomId)
            .eq('user_uid', member.user_uid),
        ),
      );
    } catch {
      // evita bloquear el envio en firestore ante fallos transitorios de supabase
    }
  }
}
