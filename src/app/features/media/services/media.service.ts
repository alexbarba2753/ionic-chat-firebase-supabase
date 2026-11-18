import { Injectable, inject } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

import type { MediaType, SharedMedia } from '../../../core/models/shared-media.model';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export interface PickedMediaFile {
  blob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
  mediaType: MediaType;
}

export interface UploadMediaParams {
  roomId: string;
  senderUid: string;
  fileOrBlob: Blob;
  fileName: string;
  mimeType: string;
  mediaType: MediaType;
  messageId?: string | null;
  durationSeconds?: number | null;
}

export const CHAT_MEDIA_BUCKET = 'chat-media';
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar';

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  private readonly supabaseClient = inject(SupabaseClientService);

  async uploadMedia(params: UploadMediaParams): Promise<SharedMedia> {
    if (!params.roomId || !params.senderUid) {
      throw new Error('Faltan datos de sala o usuario para subir el archivo.');
    }
    if (params.fileOrBlob.size <= 0) {
      throw new Error('El archivo seleccionado esta vacio.');
    }
    if (params.fileOrBlob.size > MAX_MEDIA_BYTES) {
      throw new Error('El archivo supera el limite de 20 MB.');
    }

    const safeName = this.sanitizeFileName(params.fileName, params.mediaType, params.mimeType);
    const filePath = `${params.roomId}/${params.senderUid}/${Date.now()}_${safeName}`;
    const contentType = params.mimeType || 'application/octet-stream';

    const { error: uploadError } = await this.supabaseClient.client.storage
      .from(CHAT_MEDIA_BUCKET)
      .upload(filePath, params.fileOrBlob, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = this.supabaseClient.client.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    const { data, error: insertError } = await this.supabaseClient.client
      .from('shared_media')
      .insert({
        room_id: params.roomId,
        sender_uid: params.senderUid,
        message_id: params.messageId ?? null,
        file_name: params.fileName || safeName,
        file_path: filePath,
        public_url: publicUrl,
        mime_type: contentType,
        file_size: params.fileOrBlob.size,
        media_type: params.mediaType,
        duration_seconds: params.durationSeconds ?? null,
      })
      .select('*')
      .single();

    if (insertError) {
      await this.supabaseClient.client.storage.from(CHAT_MEDIA_BUCKET).remove([filePath]);
      throw insertError;
    }

    return data as SharedMedia;
  }

  async uploadImage(
    roomId: string,
    senderUid: string,
    fileOrBlob: Blob,
    fileName?: string,
    mimeType = 'image/jpeg',
    messageId: string | null = null,
  ): Promise<SharedMedia> {
    const resolvedMime = fileOrBlob.type || mimeType;
    const ext = this.resolveExtension(resolvedMime, 'jpg');
    return this.uploadMedia({
      roomId,
      senderUid,
      fileOrBlob,
      fileName: fileName || `imagen_${Date.now()}.${ext}`,
      mimeType: resolvedMime,
      mediaType: 'image',
      messageId,
    });
  }

  async uploadDocument(
    roomId: string,
    senderUid: string,
    fileOrBlob: Blob,
    fileName: string,
    mimeType = 'application/octet-stream',
    messageId: string | null = null,
  ): Promise<SharedMedia> {
    return this.uploadMedia({
      roomId,
      senderUid,
      fileOrBlob,
      fileName,
      mimeType: fileOrBlob.type || mimeType,
      mediaType: 'document',
      messageId,
    });
  }

  async uploadVoiceNote(
    roomId: string,
    senderUid: string,
    blob: Blob,
    mimeType: string,
    durationSeconds: number,
    messageId: string | null = null,
  ): Promise<SharedMedia> {
    const resolvedMime = blob.type || mimeType || 'audio/webm';
    const ext = this.resolveExtension(resolvedMime, 'webm');
    return this.uploadMedia({
      roomId,
      senderUid,
      fileOrBlob: blob,
      fileName: `nota_voz_${Date.now()}.${ext}`,
      mimeType: resolvedMime,
      mediaType: 'audio',
      durationSeconds: Math.max(1, Math.round(durationSeconds)),
      messageId,
    });
  }

  async capturePhoto(source?: CameraSource): Promise<PickedMediaFile | null> {
    const resolvedSource = source ?? (Capacitor.isNativePlatform() ? CameraSource.Prompt : CameraSource.Photos);
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: resolvedSource,
      });

      if (!photo.webPath) {
        return null;
      }

      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const mimeType = blob.type || `image/${photo.format || 'jpeg'}`;
      const ext = this.resolveExtension(mimeType, photo.format || 'jpg');

      return {
        blob,
        fileName: `foto_${Date.now()}.${ext}`,
        mimeType,
        fileSize: blob.size,
        mediaType: 'image',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('cancel')) {
        return null;
      }
      throw error;
    }
  }

  pickWebFile(accept = '*/*', forcedType?: MediaType): Promise<PickedMediaFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';

      let settled = false;
      const cleanup = () => {
        window.removeEventListener('focus', onWindowFocus);
        input.remove();
      };

      const finish = (result: PickedMediaFile | null) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      };

      const onWindowFocus = () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            finish(null);
          }
        }, 400);
      };

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        finish(file ? this.prepareWebFile(file, forcedType) : null);
      });

      input.addEventListener('cancel', () => finish(null));
      window.addEventListener('focus', onWindowFocus, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  }

  prepareWebFile(file: File, forcedType?: MediaType): PickedMediaFile {
    const mimeType = file.type || 'application/octet-stream';
    return {
      blob: file,
      fileName: file.name,
      mimeType,
      fileSize: file.size,
      mediaType: forcedType ?? this.detectMediaType(mimeType, file.name),
    };
  }

  async linkMediaToMessage(mediaId: string, messageId: string): Promise<void> {
    const { error } = await this.supabaseClient.client
      .from('shared_media')
      .update({ message_id: messageId })
      .eq('id', mediaId);

    if (error) {
      throw error;
    }
  }

  async getRoomMedia(roomId: string, mediaType?: MediaType): Promise<SharedMedia[]> {
    let query = this.supabaseClient.client
      .from('shared_media')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });

    if (mediaType) {
      query = query.eq('media_type', mediaType);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return (data ?? []) as SharedMedia[];
  }

  detectMediaType(mimeType: string, fileName = ''): MediaType {
    const lowerMime = mimeType.toLowerCase();
    const lowerName = fileName.toLowerCase();

    if (lowerMime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(lowerName)) {
      return 'image';
    }
    if (lowerMime.startsWith('audio/') || /\.(webm|mp4|m4a|ogg|mp3|wav)$/i.test(lowerName)) {
      return 'audio';
    }
    return 'document';
  }

  formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
  }

  formatDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  private sanitizeFileName(rawName: string, mediaType: MediaType, mimeType: string): string {
    const trimmed = rawName.trim();
    const cleaned = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');

    if (cleaned && cleaned !== '.' && cleaned !== '..') {
      return cleaned;
    }

    const fallbackExt =
      mediaType === 'image'
        ? this.resolveExtension(mimeType, 'jpg')
        : mediaType === 'audio'
          ? this.resolveExtension(mimeType, 'webm')
          : 'bin';
    return `archivo_${Date.now()}.${fallbackExt}`;
  }

  private resolveExtension(mimeType: string, fallback: string): string {
    const lower = mimeType.toLowerCase();
    if (lower.includes('png')) {
      return 'png';
    }
    if (lower.includes('webp')) {
      return 'webp';
    }
    if (lower.includes('gif')) {
      return 'gif';
    }
    if (lower.includes('jpeg') || lower.includes('jpg')) {
      return 'jpg';
    }
    if (lower.includes('mp4')) {
      return 'm4a';
    }
    if (lower.includes('ogg')) {
      return 'ogg';
    }
    if (lower.includes('webm')) {
      return 'webm';
    }
    if (lower.includes('mpeg') || lower.includes('mp3')) {
      return 'mp3';
    }
    if (lower.includes('wav')) {
      return 'wav';
    }
    return fallback;
  }
}
