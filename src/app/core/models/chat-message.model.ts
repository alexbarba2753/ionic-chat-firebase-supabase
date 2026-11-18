export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'location' | 'poll';

export type MessageReaction = Record<string, string[]>;

export interface ReplyToRef {
  messageId: string;
  senderUid: string;
  senderName: string;
  previewText: string;
}

export interface ChatMessage {
  id?: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  senderAvatar: string | null;
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
  pollId?: string;
  replyTo?: ReplyToRef | null;
  reactions?: MessageReaction;
  readBy?: string[];
  isEdited?: boolean;
  isDeleted?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}
