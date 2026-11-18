import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

import type { SharedLocation } from '../../../core/models/shared-location.model';
import { SupabaseClientService } from '../../../core/services/supabase-client.service';

export interface CurrentCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

export interface SaveLocationPayload {
  roomId: string;
  senderUid: string;
  messageId?: string | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  label?: string | null;
  isLive?: boolean;
  expiresAt?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private readonly supabaseClient = inject(SupabaseClientService);

  async getCurrentPosition(): Promise<CurrentCoordinates> {
    if (Capacitor.isNativePlatform()) {
      const permissions = await Geolocation.checkPermissions();
      const hasPermission = permissions.location === 'granted' || permissions.coarseLocation === 'granted';
      if (!hasPermission) {
        const requested = await Geolocation.requestPermissions();
        const grantedAfterRequest = requested.location === 'granted' || requested.coarseLocation === 'granted';
        if (!grantedAfterRequest) {
          throw new Error('Permiso de ubicacion denegado en el dispositivo.');
        }
      }
    }

    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });
      return this.mapPosition(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
        position.timestamp,
      );
    } catch (error) {
      if (!Capacitor.isNativePlatform() && typeof navigator !== 'undefined' && navigator.geolocation) {
        return this.getBrowserPositionFallback();
      }
      throw new Error(this.resolveGeolocationError(error), { cause: error });
    }
  }

  async saveLocation(payload: SaveLocationPayload): Promise<SharedLocation> {
    if (!this.isValidCoordinates(payload.latitude, payload.longitude)) {
      throw new Error('Coordenadas geograficas invalidas.');
    }

    const row = {
      room_id: payload.roomId,
      sender_uid: payload.senderUid,
      message_id: payload.messageId ?? null,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy ?? null,
      label: payload.label?.trim() || null,
      is_live: payload.isLive ?? false,
      expires_at: payload.expiresAt ?? null,
    };

    const { data, error } = await this.supabaseClient.client.from('shared_locations').insert(row).select('*').single();

    if (error) {
      throw error;
    }

    return data as SharedLocation;
  }

  async updateLocationMessageId(locationId: string, messageId: string): Promise<void> {
    const { error } = await this.supabaseClient.client
      .from('shared_locations')
      .update({ message_id: messageId })
      .eq('id', locationId);

    if (error) {
      throw error;
    }
  }

  async getRoomLocations(roomId: string, limit = 50): Promise<SharedLocation[]> {
    const { data, error } = await this.supabaseClient.client
      .from('shared_locations')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return (data ?? []) as SharedLocation[];
  }

  getGoogleMapsUrl(latitude: number, longitude: number): string {
    const { lat, lng } = this.clampCoordinates(latitude, longitude);
    return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
  }

  getOpenStreetMapUrl(latitude: number, longitude: number): string {
    const { lat, lng } = this.clampCoordinates(latitude, longitude);
    return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=16/${lat.toFixed(6)}/${lng.toFixed(6)}`;
  }

  getOpenStreetMapEmbedUrl(latitude: number, longitude: number, delta = 0.005): string {
    const { lat, lng } = this.clampCoordinates(latitude, longitude);
    const safeDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 1) : 0.005;
    // delimita la caja geografica dentro de rangos validos para evitar errores de render en osm
    const minLat = Math.max(-90, lat - safeDelta);
    const maxLat = Math.min(90, lat + safeDelta);
    const minLng = Math.max(-180, lng - safeDelta);
    const maxLng = Math.min(180, lng + safeDelta);

    return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng.toFixed(6)}%2C${minLat.toFixed(6)}%2C${maxLng.toFixed(6)}%2C${maxLat.toFixed(6)}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
  }

  formatCoordinates(latitude: number, longitude: number): string {
    if (!this.isValidCoordinates(latitude, longitude)) {
      return '';
    }
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  isValidCoordinates(latitude: unknown, longitude: unknown): boolean {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  private getBrowserPositionFallback(): Promise<CurrentCoordinates> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve(this.mapPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp));
        },
        (err) => {
          reject(new Error(this.resolveGeolocationError(err), { cause: err }));
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        },
      );
    });
  }

  private mapPosition(latitude: number, longitude: number, accuracy: number, timestamp: number): CurrentCoordinates {
    return {
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
      timestamp,
    };
  }

  private clampCoordinates(latitude: number, longitude: number): { lat: number; lng: number } {
    const safeLat = Number.isFinite(latitude) ? Math.max(-90, Math.min(90, latitude)) : 0;
    const safeLng = Number.isFinite(longitude) ? Math.max(-180, Math.min(180, longitude)) : 0;
    return { lat: safeLat, lng: safeLng };
  }

  private resolveGeolocationError(error: unknown): string {
    const code = (error as { code?: number })?.code;
    if (code === 1) {
      return 'Permiso de ubicacion denegado. Activalo en tu navegador o dispositivo.';
    }
    if (code === 3) {
      return 'Tiempo de espera agotado al obtener la ubicacion GPS.';
    }
    if (error instanceof Error && error.message.toLowerCase().includes('denied')) {
      return 'Permiso de ubicacion denegado.';
    }
    return 'No se pudo obtener la ubicacion actual.';
  }
}
