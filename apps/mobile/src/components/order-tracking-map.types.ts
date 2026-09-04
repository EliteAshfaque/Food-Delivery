import type { Coordinates } from '@/hooks/user-order.socket';

export type OrderTrackingMapProps = {
  delivery: Coordinates;
  driver?: Coordinates | null;
  live?: boolean;
};
