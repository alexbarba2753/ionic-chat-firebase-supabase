import { CommonModule } from '@angular/common';
import type { OnChanges, SimpleChanges } from '@angular/core';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { IonButton, IonIcon, IonSearchbar } from '@ionic/angular';

import type { ChatMessage } from '../../../../core/models/chat-message.model';

@Component({
  selector: 'app-message-search-bar',
  templateUrl: './message-search-bar.component.html',
  styleUrls: ['./message-search-bar.component.scss'],
  imports: [CommonModule, IonButton, IonIcon, IonSearchbar],
})
export class MessageSearchBarComponent implements OnChanges {
  @Input() messages: ChatMessage[] = [];
  @Input() placeholder = 'Buscar en la sala...';

  @Output() queryChange = new EventEmitter<string>();
  @Output() matchesChange = new EventEmitter<string[]>();
  @Output() activeMatchChange = new EventEmitter<string | null>();
  @Output() closed = new EventEmitter<void>();

  readonly query = signal('');
  readonly matches = signal<string[]>([]);
  readonly activeIndex = signal(0);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messages'] && !changes['messages'].firstChange && this.query().trim()) {
      this.recomputeMatches(false);
    }
  }

  onSearchInput(event: CustomEvent<{ value?: string | null }>): void {
    const raw = (event.detail.value ?? '').toString();
    this.query.set(raw);
    this.queryChange.emit(raw);
    this.recomputeMatches(true);
  }

  onClear(): void {
    this.query.set('');
    this.matches.set([]);
    this.activeIndex.set(0);
    this.queryChange.emit('');
    this.matchesChange.emit([]);
    this.activeMatchChange.emit(null);
  }

  onPreviousMatch(): void {
    const list = this.matches();
    if (!list.length) {
      return;
    }
    const nextIdx = (this.activeIndex() - 1 + list.length) % list.length;
    this.activeIndex.set(nextIdx);
    this.activeMatchChange.emit(list[nextIdx] ?? null);
  }

  onNextMatch(): void {
    const list = this.matches();
    if (!list.length) {
      return;
    }
    const nextIdx = (this.activeIndex() + 1) % list.length;
    this.activeIndex.set(nextIdx);
    this.activeMatchChange.emit(list[nextIdx] ?? null);
  }

  onClose(): void {
    this.onClear();
    this.closed.emit();
  }

  private recomputeMatches(focusLatest: boolean): void {
    const needle = this.normalizeText(this.query());
    if (!needle) {
      this.matches.set([]);
      this.activeIndex.set(0);
      this.matchesChange.emit([]);
      this.activeMatchChange.emit(null);
      return;
    }

    const foundIds: string[] = [];
    for (const msg of this.messages) {
      if (!msg.id || msg.isDeleted) {
        continue;
      }
      const haystack = this.normalizeText(
        [msg.text, msg.fileName ?? '', msg.locationLabel ?? '', msg.senderName].join(' '),
      );
      if (haystack.includes(needle)) {
        foundIds.push(msg.id);
      }
    }

    this.matches.set(foundIds);
    this.matchesChange.emit(foundIds);

    if (!foundIds.length) {
      this.activeIndex.set(0);
      this.activeMatchChange.emit(null);
      return;
    }

    const targetIdx = focusLatest ? foundIds.length - 1 : Math.min(this.activeIndex(), foundIds.length - 1);
    this.activeIndex.set(targetIdx);
    this.activeMatchChange.emit(foundIds[targetIdx] ?? null);
  }

  private normalizeText(value: string): string {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
