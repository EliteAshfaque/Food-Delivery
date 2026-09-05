import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getServerUrl } from '@/lib/api-config';
import { api } from '@/lib/axios';
import { getToken } from '../../lib/auth';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

type ScopedLocation = {
  coordinates: Coordinates;
  scopeId: string;
};

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(`${getServerUrl()}/orders`, {
      transports: ['websocket'],
      autoConnect: false,
      auth: (callback) => {
        void getToken()
          .then((token) => callback({ token }))
          .catch(() => callback({}));
      },
    });
  }
  return socket;
}

export function useOrderSocket(orderId: string | null) {
  const [orderUpdate, setOrderUpdate] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    if (!orderId) return;

    const s = getSocket();
    s.connect();
    s.emit('join:order', orderId);

    const handler = (data: { id?: string }) => {
      if (data.id === orderId) setOrderUpdate(data);
    };

    s.on('order:updated', handler);

    return () => {
      s.off('order:updated', handler);
    };
  }, [orderId]);

  return orderUpdate;
}

/** Hydrate from Redis + listen for live driver GPS on the order room. */
export function useDriverLocation(
  orderId: string | null,
  enabled: boolean,
) {
  const [latestLocation, setLatestLocation] = useState<ScopedLocation | null>(
    null,
  );

  useEffect(() => {
    if (!orderId || !enabled) {
      return;
    }

    let cancelled = false;

    void api
      .get<Coordinates | null>(`/location/${orderId}`)
      .then((res) => {
        if (!cancelled && res.data) {
          setLatestLocation({ coordinates: res.data, scopeId: orderId });
        }
      })
      .catch(() => {
        // No cached location yet — driver may not have started sharing
      });

    const s = getSocket();
    s.connect();
    s.emit('join:order', orderId);

    const handler = (data: {
      orderId?: string;
      latitude: number;
      longitude: number;
    }) => {
      if (data.orderId === orderId) {
        setLatestLocation({
          coordinates: {
            latitude: data.latitude,
            longitude: data.longitude,
          },
          scopeId: orderId,
        });
      }
    };

    s.on('driver:location', handler);

    return () => {
      cancelled = true;
      s.off('driver:location', handler);
    };
  }, [orderId, enabled]);

  // Do not synchronously clear state when the order changes or tracking is
  // disabled. Scope each update instead, so stale GPS is never exposed while
  // an in-flight request from a previous order safely settles in the background.
  return enabled && orderId && latestLocation?.scopeId === orderId
    ? latestLocation.coordinates
    : null;
}

export function useRestaurantSocket<T extends { id: string }>(
  restaurantId: string | null,
) {
  const [orderUpdate, setOrderUpdate] = useState<T | null>(null);

  useEffect(() => {
    if (!restaurantId) return;

    const s = getSocket();
    s.connect();
    s.emit('join:restaurant', restaurantId);

    const handler = (data: T) => {
      setOrderUpdate(data);
    };

    s.on('order:updated', handler);

    return () => {
      s.off('order:updated', handler);
    };
  }, [restaurantId]);

  return orderUpdate;
}

/** Live driver GPS for an owner while the driver is heading to pickup. */
export function useRestaurantDriverLocation(restaurantId: string | null) {
  const [latestLocation, setLatestLocation] = useState<ScopedLocation | null>(
    null,
  );

  useEffect(() => {
    if (!restaurantId) {
      return;
    }

    const s = getSocket();
    s.connect();
    s.emit('join:restaurant', restaurantId);

    const handler = (data: {
      restaurantId?: string;
      latitude: number;
      longitude: number;
    }) => {
      if (data.restaurantId === restaurantId) {
        setLatestLocation({
          coordinates: {
            latitude: data.latitude,
            longitude: data.longitude,
          },
          scopeId: restaurantId,
        });
      }
    };

    s.on('driver:location', handler);
    return () => {
      s.off('driver:location', handler);
    };
  }, [restaurantId]);

  return restaurantId && latestLocation?.scopeId === restaurantId
    ? latestLocation.coordinates
    : null;
}

/** Join driver room and listen for incoming delivery assignments. */
export function useDriverSocket(driverId: string | null) {
  const [incomingOrder, setIncomingOrder] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    if (!driverId) return;

    const s = getSocket();
    s.connect();
    s.emit('join:driver', driverId);

    const handler = (data: Record<string, unknown>) => {
      setIncomingOrder(data);
    };

    s.on('driver:assigned', handler);

    return () => {
      s.off('driver:assigned', handler);
    };
  }, [driverId]);

  return {
    incomingOrder,
    clearIncomingOrder: () => setIncomingOrder(null),
  };
}
