import { Injectable, inject } from '@angular/core';

import type { ChatPoll, PollOption, PollVote } from '../../../core/models/poll.model';
import { FirebaseClientService } from '../../../core/services/firebase-client.service';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export interface PollOptionResult {
  id: string;
  label: string;
  votes: number;
  percentage: number;
  isSelected: boolean;
}

export interface PollDetails {
  poll: ChatPoll;
  options: PollOptionResult[];
  totalVotes: number;
  userVoteOptionId: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class PollsService {
  private readonly firebaseClient = inject(FirebaseClientService);
  private readonly supabaseClient = inject(SupabaseClientService);

  async createPoll(roomId: string, question: string, optionLabels: string[]): Promise<ChatPoll> {
    const uid = this.requireCurrentUid();
    const cleanQuestion = question.trim();
    const cleanLabels = optionLabels.map((label) => label.trim()).filter(Boolean);

    if (!roomId.trim()) {
      throw new Error('Sala invalida para crear encuesta.');
    }
    if (!cleanQuestion) {
      throw new Error('La pregunta es obligatoria.');
    }
    if (cleanLabels.length < 2 || cleanLabels.length > 6) {
      throw new Error('La encuesta debe tener entre 2 y 6 opciones.');
    }

    const options: PollOption[] = cleanLabels.map((label, index) => ({
      id: `opt_${index + 1}`,
      label,
    }));

    const { data, error } = await this.supabaseClient.client
      .from('polls')
      .insert({
        room_id: roomId,
        created_by: uid,
        question: cleanQuestion,
        options,
        is_closed: false,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data as ChatPoll;
  }

  async getPollDetails(pollId: string, currentUid?: string): Promise<PollDetails | null> {
    const uid = currentUid ?? this.firebaseClient.auth.currentUser?.uid ?? '';

    const [pollResult, votesResult] = await Promise.all([
      this.supabaseClient.client.from('polls').select('*').eq('id', pollId).maybeSingle(),
      this.supabaseClient.client.from('poll_votes').select('*').eq('poll_id', pollId),
    ]);

    if (pollResult.error) {
      throw pollResult.error;
    }
    if (votesResult.error) {
      throw votesResult.error;
    }
    if (!pollResult.data) {
      return null;
    }

    const poll = pollResult.data as ChatPoll;
    const votes = (votesResult.data ?? []) as PollVote[];
    return this.buildPollDetails(poll, votes, uid);
  }

  async vote(pollId: string, optionId: string): Promise<PollDetails> {
    const uid = this.requireCurrentUid();

    const { data: pollData, error: pollError } = await this.supabaseClient.client
      .from('polls')
      .select('is_closed')
      .eq('id', pollId)
      .single();

    if (pollError) {
      throw pollError;
    }
    if ((pollData as { is_closed: boolean }).is_closed) {
      throw new Error('La encuesta ya esta cerrada.');
    }

    const { data: existingVote, error: existingError } = await this.supabaseClient.client
      .from('poll_votes')
      .select('id, option_id')
      .eq('poll_id', pollId)
      .eq('voter_uid', uid)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    const currentVote = existingVote as { id: number; option_id: string } | null;
    if (currentVote?.option_id !== optionId) {
      if (currentVote) {
        // elimina voto previo para respetar unique (poll_id, voter_uid) sin requerir politica update
        const { error: deleteError } = await this.supabaseClient.client
          .from('poll_votes')
          .delete()
          .eq('poll_id', pollId)
          .eq('voter_uid', uid);

        if (deleteError) {
          throw deleteError;
        }
      }

      const { error: insertError } = await this.supabaseClient.client.from('poll_votes').insert({
        poll_id: pollId,
        voter_uid: uid,
        option_id: optionId,
      });

      if (insertError) {
        throw insertError;
      }
    }

    const refreshed = await this.getPollDetails(pollId, uid);
    if (!refreshed) {
      throw new Error('No se encontro la encuesta.');
    }
    return refreshed;
  }

  async closePoll(pollId: string): Promise<PollDetails> {
    const uid = this.requireCurrentUid();

    const { error } = await this.supabaseClient.client.from('polls').update({ is_closed: true }).eq('id', pollId);

    if (error) {
      throw error;
    }

    const refreshed = await this.getPollDetails(pollId, uid);
    if (!refreshed) {
      throw new Error('No se encontro la encuesta.');
    }
    return refreshed;
  }

  subscribePollUpdates(pollId: string, onChange: () => void): () => void {
    const suffix = Math.random().toString(36).slice(2, 8);
    const channel = this.supabaseClient.client
      .channel(`poll-${pollId}-${suffix}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes', filter: `poll_id=eq.${pollId}` },
        () => onChange(),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, () =>
        onChange(),
      )
      .subscribe();

    return () => {
      void this.supabaseClient.client.removeChannel(channel);
    };
  }

  private buildPollDetails(poll: ChatPoll, votes: PollVote[], currentUid: string): PollDetails {
    const counts = new Map<string, number>();
    let userVoteOptionId: string | null = null;

    for (const vote of votes) {
      counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + 1);
      if (currentUid && vote.voter_uid === currentUid) {
        userVoteOptionId = vote.option_id;
      }
    }

    const rawOptions = Array.isArray(poll.options) ? poll.options : [];
    const totalVotes = votes.length;

    const options: PollOptionResult[] = rawOptions.map((option) => {
      const optionVotes = counts.get(option.id) ?? 0;
      return {
        id: option.id,
        label: option.label,
        votes: optionVotes,
        percentage: totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0,
        isSelected: userVoteOptionId === option.id,
      };
    });

    return {
      poll,
      options,
      totalVotes,
      userVoteOptionId,
    };
  }

  private requireCurrentUid(): string {
    const uid = this.firebaseClient.auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Debes iniciar sesion para gestionar encuestas.');
    }
    return uid;
  }
}
