import { CommonModule } from '@angular/common';
import type { OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { IonBadge, IonButton, IonIcon, IonSpinner } from '@ionic/angular';

import type { PollDetails } from '../../services/polls.service';
import { PollsService } from '../../services/polls.service';

@Component({
  selector: 'app-poll-card',
  templateUrl: './poll-card.component.html',
  styleUrls: ['./poll-card.component.scss'],
  imports: [CommonModule, IonBadge, IonButton, IonIcon, IonSpinner],
})
export class PollCardComponent implements OnInit, OnChanges, OnDestroy {
  @Input() pollId = '';
  @Input() currentUid = '';
  @Input() canManage = false;

  @Output() voted = new EventEmitter<PollDetails>();
  @Output() pollClosed = new EventEmitter<PollDetails>();

  private readonly pollsService = inject(PollsService);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly details = signal<PollDetails | null>(null);

  private unsubscribeUpdates: (() => void) | null = null;
  private activePollId = '';

  ngOnInit(): void {
    void this.setupPoll();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pollId'] && !changes['pollId'].firstChange) {
      void this.setupPoll();
    } else if (changes['currentUid'] && !changes['currentUid'].firstChange && this.pollId) {
      void this.refreshDetails();
    }
  }

  ngOnDestroy(): void {
    this.clearSubscription();
  }

  async onVote(optionId: string): Promise<void> {
    const current = this.details();
    if (!current || current.poll.is_closed || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.pollsService.vote(current.poll.id, optionId);
      this.details.set(updated);
      this.voted.emit(updated);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo registrar tu voto.';
      this.errorMessage.set(msg);
    } finally {
      this.busy.set(false);
    }
  }

  async onClosePoll(): Promise<void> {
    const current = this.details();
    if (!current || current.poll.is_closed || !this.canManage || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.pollsService.closePoll(current.poll.id);
      this.details.set(updated);
      this.pollClosed.emit(updated);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo cerrar la encuesta.';
      this.errorMessage.set(msg);
    } finally {
      this.busy.set(false);
    }
  }

  private async setupPoll(): Promise<void> {
    this.clearSubscription();
    if (!this.pollId) {
      this.details.set(null);
      this.loading.set(false);
      return;
    }

    this.activePollId = this.pollId;
    this.unsubscribeUpdates = this.pollsService.subscribePollUpdates(this.pollId, () => {
      void this.refreshDetails();
    });
    await this.refreshDetails(true);
  }

  private async refreshDetails(showLoader = false): Promise<void> {
    if (!this.pollId) {
      return;
    }
    const requestedId = this.pollId;
    if (showLoader) {
      this.loading.set(true);
    }
    this.errorMessage.set(null);
    try {
      const result = await this.pollsService.getPollDetails(requestedId, this.currentUid || undefined);
      if (this.activePollId === requestedId) {
        this.details.set(result);
      }
    } catch {
      if (this.activePollId === requestedId) {
        this.errorMessage.set('Error al cargar la encuesta.');
      }
    } finally {
      if (this.activePollId === requestedId) {
        this.loading.set(false);
      }
    }
  }

  private clearSubscription(): void {
    if (this.unsubscribeUpdates) {
      this.unsubscribeUpdates();
      this.unsubscribeUpdates = null;
    }
  }
}
