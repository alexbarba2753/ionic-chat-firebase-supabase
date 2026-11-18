import { Injectable, inject, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { FirebaseClientService } from '../../../core/services/firebase-client.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly supabaseClient = inject(SupabaseClientService);

  readonly currentUser = signal<User | null>(this.firebaseClient.auth.currentUser);

  constructor() {
    onAuthStateChanged(this.firebaseClient.auth, (user) => {
      this.currentUser.set(user);
    });
  }

  async registerWithEmail(email: string, password: string, displayName: string, username: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    const cleanUsername = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');

    const credential = await createUserWithEmailAndPassword(this.firebaseClient.auth, cleanEmail, password);
    const user = credential.user;

    try {
      await updateProfile(user, { displayName: cleanName });
      const nowIso = new Date().toISOString();

      const { error } = await this.supabaseClient.client.from('profiles').insert({
        firebase_uid: user.uid,
        email: cleanEmail,
        display_name: cleanName,
        username: cleanUsername || null,
        avatar_url: user.photoURL ?? null,
        is_online: true,
        last_seen: nowIso,
        updated_at: nowIso,
      });

      if (error) {
        throw error;
      }

      await this.updateFirestorePresence(user, cleanName, true);
      this.currentUser.set(user);
      return user;
    } catch (err) {
      await user.delete().catch(() => undefined);
      throw err;
    }
  }

  async loginWithEmail(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(this.firebaseClient.auth, email.trim(), password);
    await this.syncProfileOnLogin(credential.user);
    this.currentUser.set(credential.user);
    return credential.user;
  }

  async loginWithGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(this.firebaseClient.auth, provider);
    await this.syncProfileOnLogin(credential.user);
    this.currentUser.set(credential.user);
    return credential.user;
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.firebaseClient.auth, email.trim());
  }

  async logout(): Promise<void> {
    const user = this.firebaseClient.auth.currentUser;
    if (user) {
      const nowIso = new Date().toISOString();
      await Promise.allSettled([
        this.supabaseClient.client
          .from('profiles')
          .update({ is_online: false, last_seen: nowIso, updated_at: nowIso })
          .eq('firebase_uid', user.uid),
        this.updateFirestorePresence(user, user.displayName ?? 'Usuario', false),
      ]);
    }
    await signOut(this.firebaseClient.auth);
    this.currentUser.set(null);
  }

  formatAuthError(error: unknown): string {
    const code = (error as { code?: string; message?: string })?.code ?? '';
    const rawMessage = (error as { message?: string })?.message ?? '';

    if (code === '23505' || rawMessage.includes('profiles_username_key')) {
      return 'El nombre de usuario ya esta en uso. Prueba con otro.';
    }

    switch (code) {
      case 'auth/email-already-in-use':
        return 'Este correo ya esta registrado.';
      case 'auth/invalid-email':
        return 'Ingresa un correo electronico valido.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Correo o contrasena incorrectos.';
      case 'auth/weak-password':
        return 'La contrasena debe tener al menos 6 caracteres.';
      case 'auth/popup-closed-by-user':
        return 'Se cancelo el inicio de sesion con Google.';
      case 'auth/operation-not-allowed':
        return 'El proveedor de acceso no esta habilitado en Firebase.';
      case 'auth/unauthorized-domain':
        return 'Este dominio no esta autorizado en Firebase Auth.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
      default:
        return 'No se pudo completar la autenticacion. Intenta nuevamente.';
    }
  }

  private async syncProfileOnLogin(user: User): Promise<void> {
    const nowIso = new Date().toISOString();
    const { data: existing, error: selectError } = await this.supabaseClient.client
      .from('profiles')
      .select('firebase_uid, display_name')
      .eq('firebase_uid', user.uid)
      .maybeSingle();

    if (selectError) {
      throw selectError;
    }

    const fallbackName = user.displayName || user.email?.split('@')[0] || 'Usuario';

    if (existing) {
      const { error: updateError } = await this.supabaseClient.client
        .from('profiles')
        .update({
          is_online: true,
          last_seen: nowIso,
          updated_at: nowIso,
        })
        .eq('firebase_uid', user.uid);
      if (updateError) {
        throw updateError;
      }
    } else {
      const generatedUsername = `u_${user.uid.slice(0, 8).toLowerCase()}`;
      const { error: insertError } = await this.supabaseClient.client.from('profiles').insert({
        firebase_uid: user.uid,
        email: (user.email ?? `${user.uid}@local.chat`).toLowerCase(),
        display_name: fallbackName,
        username: generatedUsername,
        avatar_url: user.photoURL ?? null,
        is_online: true,
        last_seen: nowIso,
        updated_at: nowIso,
      });
      if (insertError) {
        throw insertError;
      }
    }

    await this.updateFirestorePresence(user, existing?.display_name ?? fallbackName, true);
  }

  private async updateFirestorePresence(user: User, displayName: string, isOnline: boolean): Promise<void> {
    await setDoc(
      doc(this.firebaseClient.firestore, 'user_presence', user.uid),
      {
        uid: user.uid,
        displayName,
        photoURL: user.photoURL ?? null,
        isOnline,
        lastSeen: serverTimestamp(),
        statusText: isOnline ? 'En linea' : 'Desconectado',
      },
      { merge: true },
    );
  }
}
