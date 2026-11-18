import { Injectable, inject } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

import { FirebaseClientService } from './firebase-client.service';

@Injectable({
  providedIn: 'root',
})
export class SupabaseClientService {
  private readonly firebaseClient = inject(FirebaseClientService);

  // inyecta el uid de firebase en cada peticion para validar politicas rls
  readonly client: SupabaseClient = createClient(environment.supabase.url, environment.supabase.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        const baseHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
        const headers = new Headers(baseHeaders);
        const uid = this.firebaseClient.auth.currentUser?.uid;
        if (uid) {
          headers.set('x-firebase-uid', uid);
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}
