export interface UserProfile {
  firebase_uid: string;
  email: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string;
  phone: string | null;
  status_text: string;
  is_online: boolean;
  last_seen: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateProfilePayload {
  display_name?: string;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string;
  phone?: string | null;
  status_text?: string;
  is_online?: boolean;
  last_seen?: string;
}

export interface UserPresence {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isOnline: boolean;
  lastSeen: unknown;
  statusText: string;
}
