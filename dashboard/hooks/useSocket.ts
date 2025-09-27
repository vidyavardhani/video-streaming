'use client';

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { socketUrl } from '@/lib/utils';

type Role = 'agent' | 'customer';

export function useSocket(role: Role, auth: { token?: string; sessionId?: string }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    const instance = io(socketUrl, {
      transports: ['websocket'],
      autoConnect: false,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      auth: {
        role,
        token: auth.token,
        sessionId: auth.sessionId
      }
    });

    instance.connect();
    setSocket(instance);

    const handleConnect = () => setStatus('connected');
    const handleDisconnect = () => setStatus('disconnected');

    instance.on('connect', handleConnect);
    instance.on('disconnect', handleDisconnect);
    instance.on('connection:ready', (payload) => {
      console.debug('Socket ready', payload);
    });

    return () => {
      instance.off('connect', handleConnect);
      instance.off('disconnect', handleDisconnect);
      instance.disconnect();
      setSocket(null);
    };
  }, [role, auth.token, auth.sessionId]);

  return { socket, status };
}
