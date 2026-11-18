import { CommonModule } from '@angular/common';
import type { ElementRef, OnInit } from '@angular/core';
import { Component, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  IonAvatar,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';

import type { UserProfile } from '../../../../core/models/user-profile.model';
import { FirebaseClientService } from '../../../../core/services/firebase-client.service';
import { AuthService } from '../../../auth/services/auth.service';
import { type CloudConnectionStatus, ProfileService } from '../../services/profile.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonAvatar,
    IonBadge,
    IonChip,
    IonLabel,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonList,
    IonItem,
    IonSpinner,
  ],
})
export class ProfilePage implements OnInit {
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  private readonly fb = inject(FormBuilder);
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploadingAvatar = signal(false);
  readonly profile = signal<UserProfile | null>(null);
  readonly cloudStatus = signal<CloudConnectionStatus | null>(null);

  readonly form = this.fb.nonNullable.group({
    display_name: ['', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.pattern(/^[a-zA-Z0-9_]*$/)]],
    status_text: ['En linea'],
    phone: [''],
    bio: ['', [Validators.maxLength(240)]],
  });

  async ngOnInit(): Promise<void> {
    await this.loadProfile();
  }

  async loadProfile(): Promise<void> {
    this.loading.set(true);
    try {
      const user = await this.firebaseClient.waitForAuthReady();
      if (!user) {
        await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
        return;
      }

      const [loadedProfile, health] = await Promise.all([
        this.profileService.getProfile(user.uid),
        this.profileService.checkCloudConnections(user.uid),
      ]);

      if (loadedProfile) {
        this.profile.set(loadedProfile);
        this.patchForm(loadedProfile);
      }
      this.cloudStatus.set(health);
    } catch {
      await this.showToast('Error al cargar el perfil desde Supabase.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  async onSaveProfile(): Promise<void> {
    const current = this.profile();
    if (!current) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      await this.showToast('Revisa los datos ingresados.', 'warning');
      return;
    }

    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const updated = await this.profileService.updateProfile(current.firebase_uid, {
        display_name: raw.display_name.trim(),
        username: raw.username.trim() || null,
        status_text: raw.status_text,
        phone: raw.phone.trim() || null,
        bio: raw.bio.trim(),
        is_online: true,
        last_seen: new Date().toISOString(),
      });
      this.profile.set(updated);
      this.patchForm(updated);
      await this.showToast('Perfil actualizado en Firebase y Supabase.', 'success');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const msg = code === '23505' ? 'Ese nombre de usuario ya existe.' : 'No se pudo actualizar el perfil.';
      await this.showToast(msg, 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async onChangeAvatar(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await this.uploadFromNativePicker();
      return;
    }
    this.fileInputRef?.nativeElement.click();
  }

  async onWebFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    const current = this.profile();
    if (!current) {
      return;
    }

    this.uploadingAvatar.set(true);
    try {
      const updated = await this.profileService.uploadAvatar(current.firebase_uid, file, file.type);
      this.profile.set(updated);
      await this.showToast('Foto de perfil actualizada en Supabase Storage.', 'success');
    } catch {
      await this.showToast('No se pudo subir la imagen.', 'danger');
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  async onVerifyCloud(): Promise<void> {
    const current = this.profile();
    if (!current) {
      return;
    }
    const status = await this.profileService.checkCloudConnections(current.firebase_uid);
    this.cloudStatus.set(status);
    await this.showToast('Estado de conexion actualizado.', 'primary');
  }

  async onLogout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }

  get initials(): string {
    const name = this.profile()?.display_name ?? 'U';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  private async uploadFromNativePicker(): Promise<void> {
    const current = this.profile();
    if (!current) {
      return;
    }

    this.uploadingAvatar.set(true);
    try {
      const picked = await this.profileService.pickNativePhoto();
      if (!picked) {
        return;
      }
      const updated = await this.profileService.uploadAvatar(current.firebase_uid, picked.blob, picked.mimeType);
      this.profile.set(updated);
      await this.showToast('Foto de perfil subida correctamente.', 'success');
    } catch {
      await this.showToast('No se pudo cargar la foto seleccionada.', 'danger');
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  private patchForm(userProfile: UserProfile): void {
    this.form.patchValue({
      display_name: userProfile.display_name,
      username: userProfile.username ?? '',
      status_text: userProfile.status_text,
      phone: userProfile.phone ?? '',
      bio: userProfile.bio,
    });
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
