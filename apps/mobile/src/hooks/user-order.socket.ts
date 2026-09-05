import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getServerUrl } from '@/lib/api-config';
import { api } from '@/lib/axios';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(`${getServerUrl()}/orders`, {
      transports: ['websocket'],
      autoConnect: false,
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
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null);

  useEffect(() => {
    if (!orderId || !enabled) {
      setDriverLocation(null);
      return;
    }

    let cancelled = false;

    void api
      .get<Coordinates | null>(`/location/${orderId}`)
      .then((res) => {
        if (!cancelled && res.data) {
          setDriverLocation(res.data);
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
        setDriverLocation({
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    };

    s.on('driver:location', handler);

    return () => {
      cancelled = true;
      s.off('driver:location', handler);
    };
  }, [orderId, enabled]);

  return driverLocation;
}

export function useRestaurantSocket(restaurantId: string | null) {
  const [orderUpdate, setOrderUpdate] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    if (!restaurantId) return;

    const s = getSocket();
    s.connect();
    s.emit('join:restaurant', restaurantId);

    const handler = (data: Record<string, unknown>) => {
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
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null);

  useEffect(() => {
    if (!restaurantId) {
      setDriverLocation(null);
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
        setDriverLocation({
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    };

    s.on('driver:location', handler);
    return () => {
      s.off('driver:location', handler);
    };
  }, [restaurantId]);

  return driverLocation;
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
