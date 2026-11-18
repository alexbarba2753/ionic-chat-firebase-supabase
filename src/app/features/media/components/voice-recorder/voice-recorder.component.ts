import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { IonButton, IonIcon, IonText } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { micOutline, send, trashOutline } from 'ionicons/icons';

import { MediaService } from '../../services/media.service';

export interface VoiceRecordingResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

@Component({
  selector: 'app-voice-recorder',
  templateUrl: './voice-recorder.component.html',
  styleUrls: ['./voice-recorder.component.scss'],
  imports: [CommonModule, IonButton, IonIcon, IonText],
})
export class VoiceRecorderComponent implements OnInit, OnDestroy {
  @Input() disabled = false;
  @Input() autoStart = false;
  @Input() maxDurationSeconds = 300;

  @Output() recorded = new EventEmitter<VoiceRecordingResult>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() recordingStateChange = new EventEmitter<boolean>();

  private readonly mediaService = inject(MediaService);

  readonly recording = signal(false);
  readonly elapsedSeconds = signal(0);
  readonly errorMessage = signal('');
  readonly formattedTimer = computed(() => this.mediaService.formatDuration(this.elapsedSeconds()));

  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private timerId: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private stopAction: 'send' | 'cancel' | 'destroy' = 'cancel';
  private activeMimeType = 'audio/webm';

  constructor() {
    addIcons({ micOutline, send, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    if (this.autoStart && !this.disabled) {
      await this.startRecording();
    }
  }

  ngOnDestroy(): void {
    this.stopAction = 'destroy';
    this.clearTimer();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.releaseStream();
  }

  async startRecording(): Promise<void> {
    if (this.disabled || this.recording()) {
      return;
    }

    this.errorMessage.set('');

    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.errorMessage.set('Tu navegador no soporta grabacion de audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;

      const preferredMime = this.resolveSupportedMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      this.activeMimeType = recorder.mimeType || preferredMime || 'audio/webm';
      this.chunks = [];
      this.startedAt = Date.now();
      this.elapsedSeconds.set(0);
      this.stopAction = 'cancel';

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        this.handleRecorderStopped();
      };

      recorder.onerror = () => {
        this.errorMessage.set('Error durante la grabacion.');
        this.resetRecordingState();
      };

      this.mediaRecorder = recorder;
      recorder.start(250);
      this.recording.set(true);
      this.recordingStateChange.emit(true);

      this.timerId = setInterval(() => {
        const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
        this.elapsedSeconds.set(seconds);
        if (seconds >= this.maxDurationSeconds) {
          this.stopAndSend();
        }
      }, 250);
    } catch {
      this.releaseStream();
      this.errorMessage.set('Permiso de microfono denegado o no disponible.');
      this.recordingStateChange.emit(false);
    }
  }

  stopAndSend(): void {
    if (!this.mediaRecorder || !this.recording()) {
      return;
    }
    this.stopAction = 'send';
    this.clearTimer();
    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      this.handleRecorderStopped();
    }
  }

  cancelRecording(): void {
    this.stopAction = 'cancel';
    this.clearTimer();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      this.resetRecordingState();
      this.cancelled.emit();
    }
  }

  private handleRecorderStopped(): void {
    const action = this.stopAction;
    const duration = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const mimeType = this.activeMimeType;
    const blob = new Blob(this.chunks, { type: mimeType });

    this.resetRecordingState();

    if (action === 'send') {
      if (blob.size > 0) {
        this.recorded.emit({
          blob,
          mimeType,
          durationSeconds: duration,
        });
      } else {
        this.errorMessage.set('La nota de voz esta vacia.');
      }
    } else if (action === 'cancel') {
      this.cancelled.emit();
    }
  }

  private resetRecordingState(): void {
    this.clearTimer();
    this.releaseStream();
    this.mediaRecorder = null;
    this.chunks = [];
    this.elapsedSeconds.set(0);
    if (this.recording()) {
      this.recording.set(false);
      this.recordingStateChange.emit(false);
    }
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private releaseStream(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  private resolveSupportedMimeType(): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return '';
  }
}
