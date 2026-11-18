import { Injectable, inject } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { updateProfile as fbUpdateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import type { UpdateProfilePayload, UserProfile } from '../../../core/models/user-profile.model';
import { FirebaseClientService } from '../../../core/services/firebase-client.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export interface CloudConnectionStatus {
  firebaseOk: boolean;
  supabaseOk: boolean;
  checkedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly supabaseClient = inject(SupabaseClientService);

  async getProfile(uid?: string): Promise<UserProfile | null> {
    const authUser = this.firebaseClient.auth.currentUser;
    const targetUid = uid ?? authUser?.uid;
    if (!targetUid) {
      return null;
    }

    const { data, error } = await this.supabaseClient.client
      .from('profiles')
      .select('*')
      .eq('firebase_uid', targetUid)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as UserProfile;
    }

    if (authUser && authUser.uid === targetUid) {
      const nowIso = new Date().toISOString();
      const initialRow = {
        firebase_uid: authUser.uid,
        email: (authUser.email ?? `${authUser.uid}@local.chat`).toLowerCase(),
        display_name: authUser.displayName ?? authUser.email?.split('@')[0] ?? 'Usuario',
        username: `u_${authUser.uid.slice(0, 8).toLowerCase()}`,
        avatar_url: authUser.photoURL ?? null,
        is_online: true,
        last_seen: nowIso,
        updated_at: nowIso,
      };
      const { data: inserted, error: insertError } = await this.supabaseClient.client
        .from('profiles')
        .insert(initialRow)
        .select('*')
        .single();
      if (insertError) {
        throw insertError;
      }
      return inserted as UserProfile;
    }

    return null;
  }

  async updateProfile(uid: string, payload: UpdateProfilePayload): Promise<UserProfile> {
    const cleanPayload: UpdateProfilePayload & { updated_at: string } = {
      ...payload,
      updated_at: new Date().toISOString(),
    };

    if (typeof payload.username === 'string') {
      const sanitized = payload.username
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
      cleanPayload.username = sanitized || null;
    }

    const { data, error } = await this.supabaseClient.client
      .from('profiles')
      .update(cleanPayload)
      .eq('firebase_uid', uid)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    const updated = data as UserProfile;
    const authUser = this.firebaseClient.auth.currentUser;
    if (authUser && authUser.uid === uid && payload.display_name) {
      await fbUpdateProfile(authUser, { displayName: payload.display_name });
    }

    await setDoc(
      doc(this.firebaseClient.firestore, 'user_presence', uid),
      {
        uid,
        displayName: updated.display_name,
        photoURL: updated.avatar_url,
        isOnline: updated.is_online,
        statusText: updated.status_text,
        lastSeen: serverTimestamp(),
      },
      { merge: true },
    );

    return updated;
  }

  async uploadAvatar(uid: string, fileOrBlob: Blob, mimeType: string): Promise<UserProfile> {
    const ext = this.resolveExtension(mimeType);
    const filePath = `${uid}/avatar_${Date.now()}.${ext}`;

    const { error: uploadError } = await this.supabaseClient.client.storage
      .from('avatars')
      .upload(filePath, fileOrBlob, {
        contentType: mimeType || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = this.supabaseClient.client.storage.from('avatars').getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;
    const authUser = this.firebaseClient.auth.currentUser;
    if (authUser && authUser.uid === uid) {
      await fbUpdateProfile(authUser, { photoURL: publicUrl });
    }

    return this.updateProfile(uid, { avatar_url: publicUrl });
  }

  async pickNativePhoto(): Promise<{ blob: Blob; mimeType: string } | null> {
    const source = Capacitor.isNativePlatform() ? CameraSource.Prompt : CameraSource.Photos;
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source,
    });

    if (!photo.webPath) {
      return null;
    }

    const response = await fetch(photo.webPath);
    const blob = await response.blob();
    return {
      blob,
      mimeType: blob.type || `image/${photo.format || 'jpeg'}`,
    };
  }

  async checkCloudConnections(uid: string): Promise<CloudConnectionStatus> {
    const [fbResult, sbResult] = await Promise.allSettled([
      getDoc(doc(this.firebaseClient.firestore, 'user_presence', uid)),
      this.supabaseClient.client.from('profiles').select('firebase_uid').eq('firebase_uid', uid).maybeSingle(),
    ]);

    return {
      firebaseOk: fbResult.status === 'fulfilled',
      supabaseOk: sbResult.status === 'fulfilled' && !sbResult.value.error,
      checkedAt: new Date().toLocaleTimeString(),
    };
  }

  private resolveExtension(mimeType: string): string {
    if (mimeType.includes('png')) {
      return 'png';
    }
    if (mimeType.includes('webp')) {
      return 'webp';
    }
    return 'jpg';
  }
}
