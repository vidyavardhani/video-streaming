import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput } from 'react-native';
import { io, type Socket } from 'socket.io-client';

type Message = {
  id: string;
  senderType: 'agent' | 'customer' | 'system';
  body: string;
  createdAt: string;
};

type KalpOrgProps = {
  apiKey: string;
  customer?: {
    name?: string;
    email?: string;
    externalId?: string;
  };
  endpoint?: string;
  onSessionCreated?: (sessionId: string) => void;
  theme?: {
    primary?: string;
    background?: string;
    agentBubble?: string;
    customerBubble?: string;
  };
};

const DEFAULT_ENDPOINT = 'https://api.kalporg.com';

export const KalpOrg: React.FC<KalpOrgProps> = ({ apiKey, customer, endpoint = DEFAULT_ENDPOINT, onSessionCreated, theme }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessage, setPendingMessage] = useState('');
  const socketRef = useRef<Socket | null>(null);

  const colors = useMemo(
    () => ({
      primary: theme?.primary ?? '#4f46e5',
      background: theme?.background ?? '#f8fafc',
      agentBubble: theme?.agentBubble ?? '#e0e7ff',
      customerBubble: theme?.customerBubble ?? '#4f46e5'
    }),
    [theme]
  );

  useEffect(() => {
    async function bootstrap() {
      try {
        const response = await fetch(`${endpoint}/chat/initiate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-sdk-key': apiKey
          },
          body: JSON.stringify({ customer })
        });
        const payload = await response.json();
        setSessionId(payload.sessionId);
        onSessionCreated?.(payload.sessionId);
        const socket = io(endpoint, { auth: { role: 'customer', sessionId: payload.sessionId } });
        socketRef.current = socket;
        socket.on('chat:message', ({ message }) => {
          setMessages((prev) => [...prev, { ...message, id: Math.random().toString(36).slice(2) }]);
        });
      } catch (error) {
        console.error('Unable to initialize support session', error);
      }
    }
    bootstrap();
    return () => {
      socketRef.current?.disconnect();
    };
  }, [apiKey, customer, endpoint, onSessionCreated]);

  const sendMessage = () => {
    if (!sessionId || !pendingMessage.trim()) return;
    const message: Message = {
      id: Math.random().toString(36).slice(2),
      senderType: 'customer',
      body: pendingMessage,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, message]);
    socketRef.current?.emit('chat:message', { sessionId, body: pendingMessage });
    setPendingMessage('');
  };

  const renderItem = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.message,
        item.senderType === 'customer'
          ? { alignSelf: 'flex-end', backgroundColor: colors.customerBubble }
          : { alignSelf: 'flex-start', backgroundColor: colors.agentBubble }
      ]}
    >
      <Text style={styles.messageText}>{item.body}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message"
          value={pendingMessage}
          onChangeText={setPendingMessage}
        />
        <TouchableOpacity style={[styles.sendButton, { backgroundColor: colors.primary }]} onPress={sendMessage}>
          <Text style={styles.sendLabel}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden'
  },
  list: {
    padding: 16,
    gap: 12
  },
  message: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%'
  },
  messageText: {
    color: '#0f172a',
    fontSize: 14
  },
  composer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0'
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginRight: 8
  },
  sendButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center'
  },
  sendLabel: {
    color: '#ffffff',
    fontWeight: '600'
  }
});

export default KalpOrg;
