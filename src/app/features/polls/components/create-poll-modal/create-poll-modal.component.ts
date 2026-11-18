import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import type { FormArray, FormControl } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';

import type { ChatPoll } from '../../../../core/models/poll.model';
import { PollsService } from '../../services/polls.service';

@Component({
  selector: 'app-create-poll-modal',
  templateUrl: './create-poll-modal.component.html',
  styleUrls: ['./create-poll-modal.component.scss'],
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
    IonFooter,
    IonList,
    IonItem,
    IonInput,
    IonTextarea,
    IonText,
    IonSpinner,
  ],
})
export class CreatePollModalComponent {
  @Input() roomId = '';

  @Output() pollCreated = new EventEmitter<ChatPoll>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly pollsService = inject(PollsService);
  private readonly modalCtrl = inject(ModalController);

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    question: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    options: this.fb.array<FormControl<string>>([this.buildOptionControl(), this.buildOptionControl()]),
  });

  get optionsArray(): FormArray<FormControl<string>> {
    return this.form.controls.options;
  }

  get canAddOption(): boolean {
    return this.optionsArray.length < 6;
  }

  get canRemoveOption(): boolean {
    return this.optionsArray.length > 2;
  }

  addOption(): void {
    if (!this.canAddOption) {
      return;
    }
    this.optionsArray.push(this.buildOptionControl());
  }

  removeOption(index: number): void {
    if (!this.canRemoveOption || index < 0 || index >= this.optionsArray.length) {
      return;
    }
    this.optionsArray.removeAt(index);
  }

  async onCancel(): Promise<void> {
    this.cancelled.emit();
    const top = await this.modalCtrl.getTop();
    if (top) {
      await top.dismiss(null, 'cancel');
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Completa la pregunta y al menos 2 opciones validas.');
      return;
    }

    const question = this.form.controls.question.getRawValue().trim();
    const optionLabels = this.optionsArray.controls.map((control) => control.getRawValue().trim()).filter(Boolean);

    if (question.length < 3 || optionLabels.length < 2) {
      this.errorMessage.set('Ingresa una pregunta y minimo 2 opciones.');
      return;
    }

    this.saving.set(true);
    try {
      const created = await this.pollsService.createPoll(this.roomId, question, optionLabels);
      this.pollCreated.emit(created);
      const top = await this.modalCtrl.getTop();
      if (top) {
        await top.dismiss(created, 'created');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo crear la encuesta.';
      this.errorMessage.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  private buildOptionControl(): FormControl<string> {
    return this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(100)]);
  }
}
