import { CommonModule } from '@angular/common';
import type { OnChanges } from '@angular/core';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { IonButton, IonChip, IonIcon, IonLabel } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { locationOutline, navigateOutline, openOutline } from 'ionicons/icons';

import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-location-card',
  templateUrl: './location-card.component.html',
  styleUrls: ['./location-card.component.scss'],
  imports: [CommonModule, IonButton, IonChip, IonIcon, IonLabel],
})
export class LocationCardComponent implements OnChanges {
  @Input({ required: true }) latitude!: number;
  @Input({ required: true }) longitude!: number;
  @Input() label: string | null | undefined = null;
  @Input() accuracy: number | null | undefined = null;
  @Input() showEmbed = true;
  @Input() compact = false;

  @Output() openExternal = new EventEmitter<'google' | 'osm'>();

  private readonly locationService = inject(LocationService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly hasValidCoords = signal(false);
  readonly formattedCoords = signal('');
  readonly googleMapsUrl = signal('');
  readonly openStreetMapUrl = signal('');
  readonly safeEmbedUrl = signal<SafeResourceUrl | null>(null);

  constructor() {
    addIcons({ locationOutline, navigateOutline, openOutline });
  }

  ngOnChanges(): void {
    const valid = this.locationService.isValidCoordinates(this.latitude, this.longitude);
    this.hasValidCoords.set(valid);

    if (!valid) {
      this.formattedCoords.set('');
      this.googleMapsUrl.set('');
      this.openStreetMapUrl.set('');
      this.safeEmbedUrl.set(null);
      return;
    }

    this.formattedCoords.set(this.locationService.formatCoordinates(this.latitude, this.longitude));
    this.googleMapsUrl.set(this.locationService.getGoogleMapsUrl(this.latitude, this.longitude));
    this.openStreetMapUrl.set(this.locationService.getOpenStreetMapUrl(this.latitude, this.longitude));

    const embedUrl = this.locationService.getOpenStreetMapEmbedUrl(this.latitude, this.longitude);
    this.safeEmbedUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl));
  }

  get displayLabel(): string {
    const clean = this.label?.trim();
    return clean ? clean : 'Ubicacion compartida';
  }

  get formattedAccuracy(): string | null {
    if (this.accuracy === null || this.accuracy === undefined || !Number.isFinite(this.accuracy)) {
      return null;
    }
    return `± ${Math.round(this.accuracy)} m`;
  }

  onOpenExternal(provider: 'google' | 'osm'): void {
    this.openExternal.emit(provider);
  }
}
