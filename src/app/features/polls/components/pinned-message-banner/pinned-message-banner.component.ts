import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import type { ChatMessage } from '../../../../core/models/chat-message.model';

@Component({
  selector: 'app-pinned-message-banner',
  templateUrl: './pinned-message-banner.component.html',
  styleUrls: ['./pinned-message-banner.component.scss'],
  imports: [CommonModule, IonButton, IonIcon],
})
export class PinnedMessageBannerComponent {
  @Input() message: ChatMessage | null = null;
  @Input() canUnpin = false;

  @Output() jumpToMessage = new EventEmitter<string>();
  @Output() unpinMessage = new EventEmitter<void>();

  get previewText(): string {
    const msg = this.message;
    if (!msg) {
      return '';
    }
    if (msg.isDeleted) {
      return 'Mensaje eliminado';
    }
    if (msg.text.trim()) {
      return msg.text;
    }
    switch (msg.type) {
      case 'image':
        return 'Imagen adjunta';
      case 'document':
        return msg.fileName || 'Documento adjunto';
      case 'audio':
        return 'Nota de voz';
      case 'location':
        return msg.locationLabel || 'Ubicacion compartida';
      case 'poll':
        return 'Encuesta';
      default:
        return 'Mensaje fijado';
    }
  }

  onJump(): void {
    const id = this.message?.id;
    if (id) {
      this.jumpToMessage.emit(id);
    }
  }

  onUnpin(event: Event): void {
    event.stopPropagation();
    this.unpinMessage.emit();
  }
}
