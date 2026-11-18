import { Injectable, inject } from '@angular/core';

import type { ChatRoom, RoomMember, RoomRole, RoomType } from '../../../core/models/chat-room.model';
import type { UserProfile } from '../../../core/models/user-profile.model';
import { FirebaseClientService } from '../../../core/services/firebase-client.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export interface UserRoomSummary {
  room: ChatRoom;
  membership: RoomMember;
  directPeer?: UserProfile | null;
}

export interface CreateRoomPayload {
  name: string;
  description?: string;
  room_type: Exclude<RoomType, 'direct'>;
  is_private?: boolean;
  member_uids?: string[];
}

export interface UpdateRoomPayload {
  name?: string;
  description?: string;
  is_private?: boolean;
  avatar_url?: string | null;
}

interface MembershipWithRoomRow extends RoomMember {
  room: ChatRoom | null;
}

interface MemberWithProfileRow extends RoomMember {
  profile: UserProfile | null;
}

@Injectable({
  providedIn: 'root',
})
export class RoomsService {
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly supabaseClient = inject(SupabaseClientService);

  async getCurrentUid(): Promise<string> {
    const user = await this.firebaseClient.waitForAuthReady();
    if (!user) {
      throw new Error('Debes iniciar sesion para gestionar salas.');
    }
    return user.uid;
  }

  async listUserRooms(): Promise<UserRoomSummary[]> {
    const uid = await this.getCurrentUid();
    const { data, error } = await this.supabaseClient.client
      .from('room_members')
      .select('*, room:chat_rooms(*)')
      .eq('user_uid', uid);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as MembershipWithRoomRow[];
    const summaries: UserRoomSummary[] = [];
    const directRoomIds: string[] = [];

    for (const row of rows) {
      if (!row.room) {
        continue;
      }
      const membership: RoomMember = {
        id: row.id,
        room_id: row.room_id,
        user_uid: row.user_uid,
        role: row.role,
        unread_count: row.unread_count,
        is_muted: row.is_muted,
        joined_at: row.joined_at,
      };
      summaries.push({
        room: row.room,
        membership,
      });
      if (row.room.room_type === 'direct') {
        directRoomIds.push(row.room.id);
      }
    }

    if (directRoomIds.length > 0) {
      const { data: peerRows } = await this.supabaseClient.client
        .from('room_members')
        .select('room_id, user_uid, profile:profiles(*)')
        .in('room_id', directRoomIds)
        .neq('user_uid', uid);

      const peerByRoom: Record<string, UserProfile | null> = {};
      for (const peer of (peerRows ?? []) as { room_id: string; profile: UserProfile | null }[]) {
        peerByRoom[peer.room_id] = peer.profile ?? null;
      }

      for (const summary of summaries) {
        if (summary.room.room_type === 'direct') {
          summary.directPeer = peerByRoom[summary.room.id] ?? null;
        }
      }
    }

    summaries.sort((a, b) => {
      const timeA = Date.parse(a.room.last_message_at || a.room.created_at || '');
      const timeB = Date.parse(b.room.last_message_at || b.room.created_at || '');
      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
    });

    return summaries;
  }

  async listPublicChannels(): Promise<ChatRoom[]> {
    const { data, error } = await this.supabaseClient.client
      .from('chat_rooms')
      .select('*')
      .eq('room_type', 'channel')
      .eq('is_private', false)
      .order('last_message_at', { ascending: false });

    if (error) {
      throw error;
    }
    return (data ?? []) as ChatRoom[];
  }

  async getRoomById(roomId: string): Promise<ChatRoom | null> {
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
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) {
      throw error;
    }

    const roleWeight: Record<RoomRole, number> = {
      admin: 0,
      moderator: 1,
      member: 2,
    };

    return ((data ?? []) as MemberWithProfileRow[])
      .map((row) => ({
        id: row.id,
        room_id: row.room_id,
        user_uid: row.user_uid,
        role: row.role,
        unread_count: row.unread_count,
        is_muted: row.is_muted,
        joined_at: row.joined_at,
        profile: row.profile ?? undefined,
      }))
      .sort((a, b) => roleWeight[a.role] - roleWeight[b.role]);
  }

  async getMyMembership(roomId: string): Promise<RoomMember | null> {
    const uid = await this.getCurrentUid();
    const { data, error } = await this.supabaseClient.client
      .from('room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_uid', uid)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return (data as RoomMember | null) ?? null;
  }

  async getOrCreateDirectRoom(peerUid: string): Promise<ChatRoom> {
    const currentUid = await this.getCurrentUid();
    if (peerUid === currentUid) {
      throw new Error('Selecciona otro usuario para iniciar un chat directo.');
    }

    // busca salas directas donde ya participan ambos usuarios para evitar duplicados
    const { data: myDirectMemberships, error: myRoomsError } = await this.supabaseClient.client
      .from('room_members')
      .select('room_id, room:chat_rooms!inner(*)')
      .eq('user_uid', currentUid)
      .eq('room.room_type', 'direct');

    if (myRoomsError) {
      throw myRoomsError;
    }

    const candidateRooms = (myDirectMemberships ?? []) as { room_id: string; room: ChatRoom }[];
    const candidateIds = candidateRooms.map((item) => item.room_id);

    if (candidateIds.length > 0) {
      const { data: peerMatch, error: peerMatchError } = await this.supabaseClient.client
        .from('room_members')
        .select('room_id')
        .in('room_id', candidateIds)
        .eq('user_uid', peerUid)
        .limit(1)
        .maybeSingle();

      if (peerMatchError) {
        throw peerMatchError;
      }

      if (peerMatch?.room_id) {
        const existing = candidateRooms.find((item) => item.room_id === peerMatch.room_id);
        if (existing?.room) {
          return existing.room;
        }
      }
    }

    const { data: peerProfile } = await this.supabaseClient.client
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('firebase_uid', peerUid)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const roomName = (peerProfile as { display_name?: string } | null)?.display_name ?? 'Chat directo';

    const { data: createdRoom, error: createError } = await this.supabaseClient.client
      .from('chat_rooms')
      .insert({
        name: roomName,
        description: '',
        room_type: 'direct',
        is_private: true,
        created_by: currentUid,
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();

    if (createError) {
      throw createError;
    }

    const room = createdRoom as ChatRoom;
    const { error: membersError } = await this.supabaseClient.client.from('room_members').insert([
      {
        room_id: room.id,
        user_uid: currentUid,
        role: 'admin',
        unread_count: 0,
        is_muted: false,
      },
      {
        room_id: room.id,
        user_uid: peerUid,
        role: 'member',
        unread_count: 0,
        is_muted: false,
      },
    ]);

    if (membersError) {
      throw membersError;
    }

    return room;
  }

  async createRoom(payload: CreateRoomPayload): Promise<ChatRoom> {
    const currentUid = await this.getCurrentUid();
    const cleanName = payload.name.trim();
    if (!cleanName) {
      throw new Error('El nombre de la sala es obligatorio.');
    }

    const nowIso = new Date().toISOString();
    const isPrivate = payload.is_private ?? payload.room_type === 'group';

    const { data: createdRoom, error: createError } = await this.supabaseClient.client
      .from('chat_rooms')
      .insert({
        name: cleanName,
        description: (payload.description ?? '').trim(),
        room_type: payload.room_type,
        is_private: isPrivate,
        created_by: currentUid,
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();

    if (createError) {
      throw createError;
    }

    const room = createdRoom as ChatRoom;
    const otherMembers = Array.from(new Set((payload.member_uids ?? []).filter((uid) => uid && uid !== currentUid)));

    const memberRows = [
      {
        room_id: room.id,
        user_uid: currentUid,
        role: 'admin' as RoomRole,
        unread_count: 0,
        is_muted: false,
      },
      ...otherMembers.map((uid) => ({
        room_id: room.id,
        user_uid: uid,
        role: 'member' as RoomRole,
        unread_count: 0,
        is_muted: false,
      })),
    ];

    const { error: membersError } = await this.supabaseClient.client.from('room_members').insert(memberRows);
    if (membersError) {
      throw membersError;
    }

    return room;
  }

  async joinPublicChannel(roomId: string): Promise<RoomMember> {
    const currentUid = await this.getCurrentUid();
    const existing = await this.getMyMembership(roomId);
    if (existing) {
      return existing;
    }

    const { data, error } = await this.supabaseClient.client
      .from('room_members')
      .insert({
        room_id: roomId,
        user_uid: currentUid,
        role: 'member',
        unread_count: 0,
        is_muted: false,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }
    return data as RoomMember;
  }

  async addMembers(roomId: string, userUids: string[], role: RoomRole = 'member'): Promise<void> {
    const uniqueUids = Array.from(new Set(userUids.filter(Boolean)));
    if (uniqueUids.length === 0) {
      return;
    }

    const rows = uniqueUids.map((uid) => ({
      room_id: roomId,
      user_uid: uid,
      role,
      unread_count: 0,
      is_muted: false,
    }));

    const { error } = await this.supabaseClient.client
      .from('room_members')
      .upsert(rows, { onConflict: 'room_id,user_uid', ignoreDuplicates: true });

    if (error) {
      throw error;
    }
  }

  async updateMemberRole(roomId: string, userUid: string, role: RoomRole): Promise<RoomMember> {
    const { data, error } = await this.supabaseClient.client
      .from('room_members')
      .update({ role })
      .eq('room_id', roomId)
      .eq('user_uid', userUid)
      .select('*')
      .single();

    if (error) {
      throw error;
    }
    return data as RoomMember;
  }

  async removeMember(roomId: string, userUid: string): Promise<void> {
    const { error } = await this.supabaseClient.client
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_uid', userUid);

    if (error) {
      throw error;
    }
  }

  async leaveRoom(roomId: string): Promise<void> {
    const currentUid = await this.getCurrentUid();
    await this.removeMember(roomId, currentUid);
  }

  async updateRoomDetails(roomId: string, payload: UpdateRoomPayload): Promise<ChatRoom> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (payload.name !== undefined) {
      updateData['name'] = payload.name.trim();
    }
    if (payload.description !== undefined) {
      updateData['description'] = payload.description.trim();
    }
    if (payload.is_private !== undefined) {
      updateData['is_private'] = payload.is_private;
    }
    if (payload.avatar_url !== undefined) {
      updateData['avatar_url'] = payload.avatar_url;
    }

    const { data, error } = await this.supabaseClient.client
      .from('chat_rooms')
      .update(updateData)
      .eq('id', roomId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }
    return data as ChatRoom;
  }

  async toggleMute(roomId: string, isMuted: boolean): Promise<void> {
    const currentUid = await this.getCurrentUid();
    const { error } = await this.supabaseClient.client
      .from('room_members')
      .update({ is_muted: isMuted })
      .eq('room_id', roomId)
      .eq('user_uid', currentUid);

    if (error) {
      throw error;
    }
  }

  async resetUnreadCount(roomId: string): Promise<void> {
    const currentUid = await this.getCurrentUid();
    const { error } = await this.supabaseClient.client
      .from('room_members')
      .update({ unread_count: 0 })
      .eq('room_id', roomId)
      .eq('user_uid', currentUid);

    if (error) {
      throw error;
    }
  }

  subscribeRoomsUpdates(onChange: () => void): () => void {
    const channel = this.supabaseClient.client
      .channel(`rooms-sync-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, () => onChange())
      .subscribe();

    return () => {
      void this.supabaseClient.client.removeChannel(channel);
    };
  }
}
