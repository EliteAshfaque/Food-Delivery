import { Injectable } from '@nestjs/common';
import { Redis } from '@upstash/redis';

export interface DriverCoordinates {
  latitude: number;
  longitude: number;
}

@Injectable()
export class LocationService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  async saveDriverLocation(
    orderId: string,
    latitude: number,
    longitude: number,
  ) {
    const key = this.keyFor(orderId);
    await this.redis.set(key, JSON.stringify({ latitude, longitude }), {
      ex: 3600, // expires after 1 hour
    });
  }

  /** Remove a terminal delivery's last-known live position immediately. */
  async deleteDriverLocation(orderId: string) {
    await this.redis.del(this.keyFor(orderId));
  }

  // GET /location/:orderId - customer hydrates map before first live tick
  async getDriverLocation(orderId: string): Promise<DriverCoordinates | null> {
    const key = this.keyFor(orderId);
    const data = await this.redis.get<string>(key);
    if (!data) return null;

    try {
      const coordinates: unknown =
        typeof data === 'string' ? (JSON.parse(data) as unknown) : data;
      if (this.isDriverCoordinates(coordinates)) {
        return coordinates;
      }
    } catch {
      // Treat malformed cache data exactly like an absent live-location tick.
    }

    // Do not repeatedly parse invalid cache data. A cache write is best-effort
    // here, so a temporary Redis failure does not turn this read into a 500.
    try {
      await this.deleteDriverLocation(orderId);
    } catch {
      // TTL remains the fallback cleanup mechanism.
    }
    return null;
  }

  private keyFor(orderId: string) {
    return `driver:location:${orderId}`;
  }

  isDriverCoordinates(value: unknown): value is DriverCoordinates {
    return (
      typeof value === 'object' &&
      value !== null &&
      'latitude' in value &&
      'longitude' in value &&
      typeof (value as DriverCoordinates).latitude === 'number' &&
      Number.isFinite((value as DriverCoordinates).latitude) &&
      (value as DriverCoordinates).latitude >= -90 &&
      (value as DriverCoordinates).latitude <= 90 &&
      typeof (value as DriverCoordinates).longitude === 'number' &&
      Number.isFinite((value as DriverCoordinates).longitude) &&
      (value as DriverCoordinates).longitude >= -180 &&
      (value as DriverCoordinates).longitude <= 180
    );
  }
}
