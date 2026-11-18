import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import type { Timestamp } from 'firebase/firestore';

import { LocationCardComponent } from '../../../location/components/location-card/location-card.component';
import { MediaAttachmentPreviewComponent } from '../../../media/components/media-attachment-preview/media-attachment-preview.component';
import { PollCardComponent } from '../../../polls/components/poll-card/poll-card.component';
import type { ExtendedChatMessage } from '../../services/chat.service';

@Component({
  selector: 'app-message-bubble',
  templateUrl: './message-bubble.component.html',
  styleUrls: ['./message-bubble.component.scss'],
  imports: [
    CommonModule,
    IonButton,
    IonIcon,
    MediaAttachmentPreviewComponent,
    LocationCardComponent,
    PollCardComponent,
  ],
})
export class MessageBubbleComponent {
  @Input({ required: true }) message!: ExtendedChatMessage;
  @Input() currentUid = '';
  @Input() isOwn = false;
  @Input() showSenderName = true;
  @Input() isPinned = false;
  @Input() isHighlighted = false;
  @Input() canPin = false;
  @Input() canManagePolls = false;

  @Output() reply = new EventEmitter<ExtendedChatMessage>();
  @Output() forward = new EventEmitter<ExtendedChatMessage>();
  @Output() edit = new EventEmitter<ExtendedChatMessage>();
  @Output() deleteMsg = new EventEmitter<ExtendedChatMessage>();
  @Output() pinToggle = new EventEmitter<ExtendedChatMessage>();
  @Output() react = new EventEmitter<{ message: ExtendedChatMessage; emoji: string }>();
  @Output() quoteClick = new EventEmitter<string>();

  readonly quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  readonly showMenu = signal(false);
  readonly showReactionsPicker = signal(false);

  get isReadByOthers(): boolean {
    const list = this.message.readBy ?? [];
    return list.some((uid) => uid !== this.currentUid);
  }

  get reactionEntries(): { emoji: string; count: number; reacted: boolean }[] {
    const map = this.message.reactions ?? {};
    return Object.entries(map)
      .filter(([, uids]) => Array.isArray(uids) && uids.length > 0)
      .map(([emoji, uids]) => ({
        emoji,
        count: uids.length,
        reacted: uids.includes(this.currentUid),
      }));
  }

  get formattedTime(): string {
    const raw = this.message.createdAt as Timestamp | Date | string | null | undefined;
    if (!raw) {
      return '';
    }
    let date: Date | null = null;
    if (raw instanceof Date) {
      date = raw;
    } else if (typeof raw === 'string') {
      const parsed = new Date(raw);
      date = Number.isNaN(parsed.getTime()) ? null : parsed;
    } else if (typeof (raw as Timestamp).toDate === 'function') {
      date = (raw as Timestamp).toDate();
    }
    if (!date) {
      return '';
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  toggleMenu(): void {
    this.showMenu.update((v) => !v);
    if (!this.showMenu()) {
      this.showReactionsPicker.set(false);
    }
  }

  toggleReactionsPicker(): void {
    this.showReactionsPicker.update((v) => !v);
  }

  onSelectEmoji(emoji: string): void {
    this.react.emit({ message: this.message, emoji });
    this.showReactionsPicker.set(false);
    this.showMenu.set(false);
  }

  onReply(): void {
    this.reply.emit(this.message);
    this.showMenu.set(false);
  }

  onForward(): void {
    this.forward.emit(this.message);
    this.showMenu.set(false);
  }

  onEdit(): void {
    this.edit.emit(this.message);
    this.showMenu.set(false);
  }

  onDelete(): void {
    this.deleteMsg.emit(this.message);
    this.showMenu.set(false);
  }

  onPinToggle(): void {
    this.pinToggle.emit(this.message);
    this.showMenu.set(false);
  }

  onQuoteClick(): void {
    const id = this.message.replyTo?.messageId;
    if (id) {
      this.quoteClick.emit(id);
    }
  }
}
