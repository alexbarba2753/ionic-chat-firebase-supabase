import { CommonModule } from '@angular/common';
import type { OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import type { SegmentCustomEvent } from '@ionic/angular';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  documentTextOutline,
  downloadOutline,
  imagesOutline,
  micOutline,
  refreshOutline,
} from 'ionicons/icons';

import type { MediaType, SharedMedia } from '../../../../core/models/shared-media.model';
import { MediaService } from '../../services/media.service';

export type MediaGalleryFilter = 'all' | MediaType;

@Component({
  selector: 'app-media-gallery-modal',
  templateUrl: './media-gallery-modal.component.html',
  styleUrls: ['./media-gallery-modal.component.scss'],
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    IonText,
    IonTitle,
    IonToolbar,
  ],
})
export class MediaGalleryModalComponent implements OnInit, OnChanges {
  @Input({ required: true }) roomId!: string;
  @Input() roomName = 'Archivos compartidos';
  @Input() initialFilter: MediaGalleryFilter = 'all';

  @Output() dismissed = new EventEmitter<void>();
  @Output() mediaSelected = new EventEmitter<SharedMedia>();

  private readonly mediaService = inject(MediaService);
  private readonly modalCtrl = inject(ModalController, { optional: true });

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly items = signal<SharedMedia[]>([]);
  readonly activeFilter = signal<MediaGalleryFilter>('all');
  readonly selectedImage = signal<SharedMedia | null>(null);

  readonly counts = computed(() => {
    const allItems = this.items();
    return {
      all: allItems.length,
      image: allItems.filter((item) => item.media_type === 'image').length,
      document: allItems.filter((item) => item.media_type === 'document').length,
      audio: allItems.filter((item) => item.media_type === 'audio').length,
    };
  });

  readonly filteredItems = computed(() => {
    const filter = this.activeFilter();
    const allItems = this.items();
    if (filter === 'all') {
      return allItems;
    }
    return allItems.filter((item) => item.media_type === filter);
  });

  readonly imageItems = computed(() => this.filteredItems().filter((item) => item.media_type === 'image'));
  readonly nonImageItems = computed(() => this.filteredItems().filter((item) => item.media_type !== 'image'));

  constructor() {
    addIcons({
      closeOutline,
      documentTextOutline,
      downloadOutline,
      imagesOutline,
      micOutline,
      refreshOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.activeFilter.set(this.initialFilter);
    await this.loadMedia();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['initialFilter'] && !changes['initialFilter'].firstChange) {
      this.activeFilter.set(this.initialFilter);
    }
    if (changes['roomId'] && !changes['roomId'].firstChange) {
      await this.loadMedia();
    }
  }

  async loadMedia(): Promise<void> {
    if (!this.roomId) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const data = await this.mediaService.getRoomMedia(this.roomId);
      this.items.set(data);
    } catch {
      this.errorMessage.set('No se pudo cargar la galeria multimedia.');
    } finally {
      this.loading.set(false);
    }
  }

  onFilterChange(event: SegmentCustomEvent): void {
    const value = event.detail.value;
    if (value === 'all' || value === 'image' || value === 'document' || value === 'audio') {
      this.activeFilter.set(value);
    }
  }

  openImagePreview(item: SharedMedia): void {
    this.selectedImage.set(item);
    this.mediaSelected.emit(item);
  }

  closeImagePreview(): void {
    this.selectedImage.set(null);
  }

  openOrDownload(item: SharedMedia): void {
    this.mediaSelected.emit(item);
    const anchor = document.createElement('a');
    anchor.href = item.public_url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = item.file_name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  formatSize(bytes: number): string {
    return this.mediaService.formatFileSize(bytes);
  }

  formatDuration(seconds: number | null): string {
    if (seconds === null || seconds === undefined) {
      return '';
    }
    return this.mediaService.formatDuration(seconds);
  }

  formatDate(dateIso?: string): string {
    if (!dateIso) {
      return '';
    }
    const parsed = new Date(dateIso);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }
    return parsed.toLocaleDateString();
  }

  async dismiss(): Promise<void> {
    this.dismissed.emit();
    const top = await this.modalCtrl?.getTop();
    if (top) {
      await this.modalCtrl?.dismiss();
    }
  }
}
