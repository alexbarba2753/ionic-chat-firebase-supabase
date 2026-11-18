import type { UserProfile } from './user-profile.model';

export type RoomType = 'direct' | 'group' | 'channel';
export type RoomRole = 'admin' | 'moderator' | 'member';

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  room_type: RoomType;
  avatar_url: string | null;
  created_by: string;
  is_private: boolean;
  pinned_message_id: string | null;
  last_message_text: string | null;
  last_message_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface RoomMember {
  id?: number;
  room_id: string;
  user_uid: string;
  role: RoomRole;
  unread_count: number;
  is_muted: boolean;
  joined_at?: string;
  profile?: UserProfile;
}
