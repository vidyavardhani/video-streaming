(function (global) {
  const API_ROOT = '/api';

  const headersWith = (overrides = {}) => ({
    'Content-Type': 'application/json',
    ...overrides
  });

  class VVDClient {
    constructor({ developerKey, hostKey, socketUrl } = {}) {
      this.developerKey = developerKey || null;
      this.hostKey = hostKey || null;
      this.socketUrl = socketUrl || undefined;
      this.socket = null;
      this.joinToken = null;
      this.meetingCode = null;
      this.handlers = new Map();
      this.sessionOptions = null;
      this.realtimeJoined = false;
    }

    async initMeeting({ title }) {
      if (!this.hostKey) {
        throw new Error('hostKey is required to create meetings');
      }
      const res = await fetch(`${API_ROOT}/host/meetings`, {
        method: 'POST',
        headers: headersWith({ 'x-host-key': this.hostKey }),
        body: JSON.stringify({ title })
      });
      if (!res.ok) {
        throw new Error('Unable to create meeting');
      }
      const data = await res.json();
      return data.meeting;
    }

    async joinMeeting({ code, token, displayName }) {
      if (!code) throw new Error('code is required');
      const res = await fetch(`${API_ROOT}/meetings/${code}/join`, {
        method: 'POST',
        headers: headersWith(),
        body: JSON.stringify({ token, displayName })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Unable to join meeting');
      }
      const payload = await res.json();
      this.joinToken = payload.joinToken || token;
      this.meetingCode = code;
      return payload;
    }

    async sendMessage({ code = this.meetingCode, message, sender }) {
      if (!code) throw new Error('Meeting code required');
      if (!message) throw new Error('Message cannot be empty');
      const headers = headersWith();
      if (this.hostKey) {
        headers['x-host-key'] = this.hostKey;
      }
      const res = await fetch(`${API_ROOT}/host/meetings/${code}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, sender })
      });
      if (!res.ok) {
        throw new Error('Unable to send message');
      }
      return res.json();
    }

    emitLocal(event, ...args) {
      const listeners = this.handlers.get(event);
      if (!listeners) return;
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error('VVDLive listener error', error);
        }
      });
    }

    on(event, handler) {
      if (!event || typeof handler !== 'function') return () => {};
      if (!this.handlers.has(event)) {
        this.handlers.set(event, new Set());
      }
      const bucket = this.handlers.get(event);
      bucket.add(handler);
      return () => this.off(event, handler);
    }

    once(event, handler) {
      if (!event || typeof handler !== 'function') return () => {};
      const wrapper = (...args) => {
        this.off(event, wrapper);
        handler(...args);
      };
      return this.on(event, wrapper);
    }

    off(event, handler) {
      if (!event || typeof handler !== 'function') return;
      const bucket = this.handlers.get(event);
      if (bucket) {
        bucket.delete(handler);
        if (!bucket.size) {
          this.handlers.delete(event);
        }
      }
    }

    connectRealtime(options = {}) {
      if (typeof global.io !== 'function') {
        console.warn('Socket.io client not present; realtime features disabled');
        return null;
      }
      const {
        classCode = this.meetingCode,
        joinToken = this.joinToken,
        displayName,
        authToken,
        socketOptions = {}
      } = options;
      const url = this.socketUrl || undefined;
      if (this.socket) {
        this.socket.disconnect();
      }
      this.sessionOptions = { classCode, joinToken, displayName, authToken };
      const ioOptions = {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        ...socketOptions
      };
      this.socket = global.io(url, ioOptions);

      return new Promise((resolve, reject) => {
        let resolved = false;
        let rejected = false;

        const attemptJoin = (label) => {
          if (!this.sessionOptions?.classCode || !this.sessionOptions?.joinToken) {
            if (!resolved) {
              resolved = true;
              resolve(this.socket);
            }
            this.emitLocal('session:skipped', { reason: 'missing-credentials', phase: label });
            return;
          }
          this.socket.emit(
            'session:join',
            {
              classCode: this.sessionOptions.classCode,
              joinToken: this.sessionOptions.joinToken,
              displayName: this.sessionOptions.displayName,
              token: this.sessionOptions.authToken
            },
            (response = {}) => {
              if (response.error) {
                this.realtimeJoined = false;
                this.emitLocal('session:error', { phase: label, error: response.error });
                if (!resolved && !rejected) {
                  rejected = true;
                  reject(new Error(response.error));
                }
                return;
              }
              this.realtimeJoined = true;
              this.emitLocal('session:ready', response);
              if (!resolved) {
                resolved = true;
                resolve(this.socket);
              }
            }
          );
        };

        const onConnect = () => {
          this.emitLocal('socket:connect');
          attemptJoin('connect');
        };

        const onReconnect = (attempt) => {
          this.emitLocal('socket:reconnect', { attempt });
          attemptJoin('reconnect');
        };

        const onConnectError = (error) => {
          this.emitLocal('socket:error', error);
        };

        const onDisconnect = (reason) => {
          this.realtimeJoined = false;
          this.emitLocal('socket:disconnect', { reason });
        };

        const forward = (event) => {
          this.socket.on(event, (...args) => this.emitLocal(event, ...args));
        };

        this.socket.on('connect', onConnect);
        this.socket.on('reconnect', onReconnect);
        this.socket.on('connect_error', onConnectError);
        this.socket.on('disconnect', onDisconnect);
        this.socket.on('reconnect_failed', () => this.emitLocal('socket:reconnect_failed'));

        ['chat:new', 'direct:chat:new', 'direct:chat:seen', 'direct:call:ring', 'direct:call:response', 'direct:call:ended'].forEach(
          forward
        );
      });
    }

    raiseHand() {
      if (!this.socket) {
        throw new Error('Realtime socket not connected');
      }
      this.socket.emit('hand:raise');
    }

    startCall(targetToken, options = {}) {
      if (!this.socket) {
        throw new Error('Realtime socket not connected');
      }
      this.socket.emit('direct:call:initiate', {
        target: targetToken,
        media: { video: !!options.video }
      });
    }

    sendDirectMessage(targetToken, message, media) {
      if (!this.socket) {
        throw new Error('Realtime socket not connected');
      }
      this.socket.emit('direct:chat:send', { target: targetToken, message, media });
    }

    disconnectRealtime() {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
        this.realtimeJoined = false;
      }
    }
  }

  global.VVDLive = {
    init(options) {
      return new VVDClient(options);
    }
  };
})(window);
