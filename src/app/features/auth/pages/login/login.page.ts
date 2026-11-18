import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonInput,
    IonInputPasswordToggle,
    IonButton,
    IonIcon,
    IonSpinner,
    IonText,
  ],
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const { email, password } = this.form.getRawValue();
      await this.authService.loginWithEmail(email, password);
      await this.router.navigateByUrl('/rooms', { replaceUrl: true });
    } catch (error) {
      this.errorMessage.set(this.authService.formatAuthError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async onGoogleLogin(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.loginWithGoogle();
      await this.router.navigateByUrl('/rooms', { replaceUrl: true });
    } catch (error) {
      this.errorMessage.set(this.authService.formatAuthError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async onForgotPassword(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Recuperar contrasena',
      message: 'Ingresa tu correo para enviarte un enlace de recuperacion.',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'correo@ejemplo.com',
          value: this.form.controls.email.value,
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Enviar',
          handler: (data: { email?: string }) => {
            void this.sendReset(data.email ?? '');
          },
        },
      ],
    });
    await alert.present();
  }

  private async sendReset(email: string): Promise<void> {
    if (!email.trim()) {
      await this.showToast('Debes ingresar un correo valido.', 'warning');
      return;
    }
    try {
      await this.authService.resetPassword(email);
      await this.showToast('Revisa tu correo para restablecer la contrasena.', 'success');
    } catch (error) {
      await this.showToast(this.authService.formatAuthError(error), 'danger');
    }
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2800,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
