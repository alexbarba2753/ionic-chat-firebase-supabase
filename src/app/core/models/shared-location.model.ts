export interface SharedLocation {
  id: string;
  room_id: string;
  sender_uid: string;
  message_id: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  label: string | null;
  is_live: boolean;
  expires_at: string | null;
  created_at?: string;
}
