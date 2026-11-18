import { CommonModule } from '@angular/common';
import type { OnInit } from '@angular/core';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, closeOutline, locationOutline, refreshOutline, sendOutline } from 'ionicons/icons';

import type { SharedLocation } from '../../../../core/models/shared-location.model';
import { type CurrentCoordinates, LocationService } from '../../services/location.service';
import { LocationCardComponent } from '../location-card/location-card.component';

export interface ShareLocationResult {
  location: SharedLocation | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  label: string | null;
}

@Component({
  selector: 'app-share-location-modal',
  templateUrl: './share-location-modal.component.html',
  styleUrls: ['./share-location-modal.component.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    IonInput,
    IonText,
    LocationCardComponent,
  ],
})
export class ShareLocationModalComponent implements OnInit {
  @Input() roomId = '';
  @Input() senderUid = '';
  @Input() defaultLabel = '';
  @Input() saveOnConfirm = true;

  @Output() locationConfirmed = new EventEmitter<ShareLocationResult>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly locationService = inject(LocationService);
  private readonly modalCtrl = inject(ModalController);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly coords = signal<CurrentCoordinates | null>(null);
  readonly labelInput = signal('');

  constructor() {
    addIcons({
      alertCircleOutline,
      closeOutline,
      locationOutline,
      refreshOutline,
      sendOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.defaultLabel) {
      this.labelInput.set(this.defaultLabel);
    }
    await this.capturePosition();
  }

  async capturePosition(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const current = await this.locationService.getCurrentPosition();
      this.coords.set(current);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo obtener la ubicacion actual.';
      this.errorMessage.set(msg);
      this.coords.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  onLabelInput(event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value;
    this.labelInput.set(typeof value === 'string' ? value : '');
  }

  async confirmLocation(): Promise<void> {
    const current = this.coords();
    if (!current || this.saving()) {
      return;
    }

    const cleanLabel = this.labelInput().trim() || null;
    this.saving.set(true);
    this.errorMessage.set(null);

    try {
      let savedLocation: SharedLocation | null = null;
      if (this.saveOnConfirm && this.roomId && this.senderUid) {
        savedLocation = await this.locationService.saveLocation({
          roomId: this.roomId,
          senderUid: this.senderUid,
          latitude: current.latitude,
          longitude: current.longitude,
          accuracy: current.accuracy,
          label: cleanLabel,
        });
      }

      const result: ShareLocationResult = {
        location: savedLocation,
        latitude: current.latitude,
        longitude: current.longitude,
        accuracy: current.accuracy,
        label: cleanLabel,
      };

      this.locationConfirmed.emit(result);
      const top = await this.modalCtrl.getTop();
      if (top) {
        await this.modalCtrl.dismiss(result, 'confirm');
      }
    } catch {
      this.errorMessage.set('No se pudo guardar la ubicacion compartida.');
    } finally {
      this.saving.set(false);
    }
  }

  async cancel(): Promise<void> {
    this.cancelled.emit();
    const top = await this.modalCtrl.getTop();
    if (top) {
      await this.modalCtrl.dismiss(null, 'cancel');
    }
  }

  get formattedCoordinates(): string {
    const current = this.coords();
    if (!current) {
      return '';
    }
    return this.locationService.formatCoordinates(current.latitude, current.longitude);
  }
}
