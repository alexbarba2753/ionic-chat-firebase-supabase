import { CommonModule } from '@angular/common';
import { Component, Input, inject, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, documentTextOutline, downloadOutline, micOutline } from 'ionicons/icons';

import type { MediaType } from '../../../../core/models/shared-media.model';
import { MediaService } from '../../services/media.service';

@Component({
  selector: 'app-media-attachment-preview',
  templateUrl: './media-attachment-preview.component.html',
  styleUrls: ['./media-attachment-preview.component.scss'],
  imports: [CommonModule, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar],
})
export class MediaAttachmentPreviewComponent {
  @Input({ required: true }) mediaType!: MediaType;
  @Input({ required: true }) mediaUrl!: string;
  @Input() fileName = '';
  @Input() mimeType = '';
  @Input() fileSize: number | null = null;
  @Input() durationSeconds: number | null = null;
  @Input() isOwnMessage = false;

  private readonly mediaService = inject(MediaService);

  readonly viewerOpen = signal(false);

  constructor() {
    addIcons({ closeOutline, documentTextOutline, downloadOutline, micOutline });
  }

  get displayFileName(): string {
    if (this.fileName.trim()) {
      return this.fileName;
    }
    if (this.mediaType === 'image') {
      return 'Imagen adjunta';
    }
    if (this.mediaType === 'audio') {
      return 'Nota de voz';
    }
    return 'Documento adjunto';
  }

  get formattedSize(): string {
    if (this.fileSize === null || this.fileSize === undefined) {
      return '';
    }
    return this.mediaService.formatFileSize(this.fileSize);
  }

  get formattedDuration(): string {
    if (this.durationSeconds === null || this.durationSeconds === undefined) {
      return '';
    }
    return this.mediaService.formatDuration(this.durationSeconds);
  }

  get fileExtensionLabel(): string {
    const nameParts = this.fileName.split('.');
    if (nameParts.length > 1) {
      const ext = nameParts[nameParts.length - 1]?.toUpperCase();
      if (ext && ext.length <= 5) {
        return ext;
      }
    }
    const mimePart = this.mimeType.split('/')[1];
    return mimePart ? mimePart.slice(0, 6).toUpperCase() : 'FILE';
  }

  openViewer(): void {
    if (!this.mediaUrl) {
      return;
    }
    this.viewerOpen.set(true);
  }

  closeViewer(): void {
    this.viewerOpen.set(false);
  }

  openOrDownload(): void {
    if (!this.mediaUrl) {
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = this.mediaUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    if (this.fileName) {
      anchor.download = this.fileName;
    }
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
}
