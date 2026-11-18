import { Injectable, inject } from '@angular/core';

import type { UserProfile } from '../../../core/models/user-profile.model';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export interface DirectorySearchOptions {
  excludeUid?: string;
  limit?: number;
}

@Injectable({
  providedIn: 'root',
})
export class DirectoryService {
  private readonly supabaseClient = inject(SupabaseClientService);

  async searchUsers(queryText: string, options: DirectorySearchOptions = {}): Promise<UserProfile[]> {
    const limit = options.limit ?? 50;
    const sanitized = queryText.trim().replace(/[%_,()]/g, '');

    let request = this.supabaseClient.client
      .from('profiles')
      .select('*')
      .order('is_online', { ascending: false })
      .order('display_name', { ascending: true })
      .limit(limit);

    if (options.excludeUid) {
      request = request.neq('firebase_uid', options.excludeUid);
    }

    if (sanitized) {
      const pattern = `%${sanitized}%`;
      request = request.or(`display_name.ilike.${pattern},username.ilike.${pattern},email.ilike.${pattern}`);
    }

    const { data, error } = await request;
    if (error) {
      throw error;
    }
    return (data ?? []) as UserProfile[];
  }

  async getUserByUid(uid: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabaseClient.client
      .from('profiles')
      .select('*')
      .eq('firebase_uid', uid)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return (data as UserProfile | null) ?? null;
  }

  async getUsersByUids(uids: string[]): Promise<UserProfile[]> {
    const uniqueUids = Array.from(new Set(uids.filter(Boolean)));
    if (uniqueUids.length === 0) {
      return [];
    }

    const { data, error } = await this.supabaseClient.client
      .from('profiles')
      .select('*')
      .in('firebase_uid', uniqueUids);

    if (error) {
      throw error;
    }
    return (data ?? []) as UserProfile[];
  }
}
