// WebSocket Chat Room
//
// Presence, typing indicators and reconnect-with-replay, built against a
// small in-memory mock "server" rather than a real socket — the point
// being demonstrated is the PROTOCOL: every broadcast message gets a
// monotonic sequence number and stays in a log even after clients go
// offline; a reconnecting client hands back the last sequence number it
// actually saw, and the server replays everything after that instead of
// just resuming the live stream, so nothing sent while it was offline is
// lost.
//
// Usage:
//   const server = new ChatServer();
//   <ChatPanel server={server} userId="alice" />
//   <ChatPanel server={server} userId="bob" />
//
// Default export runs two panels against one shared server so you can
// disconnect one side, send messages from the other, and watch replay
// happen on reconnect.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ServerMessage {
  seq: number;
  type: 'chat' | 'presence' | 'typing';
  payload: Record<string, unknown>;
  timestamp: number;
}

type Deliver = (msg: ServerMessage) => void;

export class ChatServer {
  private log: ServerMessage[] = [];
  private nextSeq = 1;
  private clients = new Map<string, { online: boolean; deliver: Deliver }>();

  private broadcast(type: ServerMessage['type'], payload: Record<string, unknown>): ServerMessage {
    const msg: ServerMessage = { seq: this.nextSeq++, type, payload, timestamp: Date.now() };
    this.log.push(msg);
    for (const client of this.clients.values()) {
      if (client.online) client.deliver(msg);
    }
    return msg;
  }

  connect(userId: string, deliver: Deliver, lastSeenSeq: number): void {
    this.clients.set(userId, { online: true, deliver });
    const missed = this.log.filter((m) => m.seq > lastSeenSeq);
    for (const m of missed) deliver(m);
    this.broadcast('presence', { userId, online: true });
  }

  disconnect(userId: string): void {
    const client = this.clients.get(userId);
    if (client) client.online = false;
    this.broadcast('presence', { userId, online: false });
  }

  sendChat(userId: string, text: string): void {
    this.broadcast('chat', { userId, text });
  }

  setTyping(userId: string, typing: boolean): void {
    this.broadcast('typing', { userId, typing });
  }
}

function useChatConnection(server: ChatServer, userId: string) {
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState(true);
  const lastSeenSeq = useRef(0);

  const deliver = useCallback<Deliver>((msg) => {
    lastSeenSeq.current = Math.max(lastSeenSeq.current, msg.seq);
    if (msg.type === 'chat') {
      setMessages((prev) => (prev.some((m) => m.seq === msg.seq) ? prev : [...prev, msg]));
    } else if (msg.type === 'presence') {
      setPresence((prev) => ({ ...prev, [msg.payload.userId as string]: msg.payload.online as boolean }));
    } else if (msg.type === 'typing') {
      setTyping((prev) => ({ ...prev, [msg.payload.userId as string]: msg.payload.typing as boolean }));
    }
  }, []);

  useEffect(() => {
    server.connect(userId, deliver, lastSeenSeq.current);
    return () => server.disconnect(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reconnect() {
    server.connect(userId, deliver, lastSeenSeq.current);
    setConnected(true);
  }

  function simulateDisconnect() {
    server.disconnect(userId);
    setConnected(false);
  }

  return {
    messages,
    presence,
    typing,
    connected,
    reconnect,
    simulateDisconnect,
    send: (text: string) => server.sendChat(userId, text),
    setTypingState: (t: boolean) => server.setTyping(userId, t),
  };
}

export function ChatPanel({ server, userId }: { server: ChatServer; userId: string }) {
  const conn = useChatConnection(server, userId);
  const [draft, setDraft] = useState('');
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onDraftChange(value: string) {
    setDraft(value);
    conn.setTypingState(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => conn.setTypingState(false), 800);
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    conn.send(text);
    setDraft('');
    conn.setTypingState(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }

  const othersTyping = Object.entries(conn.typing).filter(([id, t]) => id !== userId && t);

  return (
    <div
      data-testid="chat-panel"
      data-user-id={userId}
      style={{ width: 220, border: '1px solid #333', borderRadius: 6, padding: 8, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>{userId}</strong>
        <span data-testid="connection-status">{conn.connected ? 'online' : 'offline'}</span>
      </div>

      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
        {Object.entries(conn.presence)
          .filter(([id]) => id !== userId)
          .map(([id, online]) => (
            <div key={id} data-testid="presence-row" data-peer-id={id} data-online={online}>
              {id}: {online ? 'online' : 'offline'}
            </div>
          ))}
      </div>

      <div
        data-testid="message-list"
        style={{ height: 100, overflowY: 'auto', border: '1px solid #333', marginBottom: 4, padding: 4 }}
      >
        {conn.messages.map((m) => (
          <div key={m.seq} data-testid="message" data-seq={m.seq}>
            <strong>{m.payload.userId as string}:</strong> {m.payload.text as string}
          </div>
        ))}
      </div>

      <div data-testid="typing-indicator" style={{ fontSize: 11, opacity: 0.6, minHeight: 14 }}>
        {othersTyping.length > 0 && `${othersTyping.map(([id]) => id).join(', ')} typing…`}
      </div>

      <input
        aria-label={`Message input for ${userId}`}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        disabled={!conn.connected}
        style={{ width: '100%', marginTop: 4 }}
      />
      <button
        data-testid="toggle-connection"
        onClick={() => (conn.connected ? conn.simulateDisconnect() : conn.reconnect())}
        style={{ marginTop: 4, fontSize: 11 }}
      >
        {conn.connected ? 'Simulate disconnect' : 'Reconnect'}
      </button>
    </div>
  );
}

export default function Demo() {
  const [server] = useState(() => new ChatServer());
  return (
    <div style={{ display: 'flex', gap: 16, padding: 16 }}>
      <ChatPanel server={server} userId="alice" />
      <ChatPanel server={server} userId="bob" />
    </div>
  );
}
