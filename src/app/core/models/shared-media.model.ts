export type MediaType = 'image' | 'document' | 'audio';

export interface SharedMedia {
  id: string;
  room_id: string;
  sender_uid: string;
  message_id: string | null;
  file_name: string;
  file_path: string;
  public_url: string;
  mime_type: string;
  file_size: number;
  media_type: MediaType;
  duration_seconds: number | null;
  created_at?: string;
}
