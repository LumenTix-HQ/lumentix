'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function connect_chat_socket(eventId: string, userId: string) {
  const res = await fetch(`${API}/chat/connect?eventId=${eventId}&userId=${userId}`);
  return res.json();
}

export async function broadcast_chat_message(eventId: string, userId: string, username: string, message: string) {
  const res = await fetch(`${API}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, userId, username, message }),
  });
  return res.json();
}

export async function moderate_chat_content(message: string) {
  const res = await fetch(`${API}/chat/moderate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

interface Message {
  id?: string;
  username: string;
  message: string;
  flagged?: boolean;
}

interface ChatWidgetProps {
  eventId: string;
  userId: string;
  username: string;
}

export default function ChatWidget({ eventId, userId, username }: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);

  const handleConnect = async () => {
    await connect_chat_socket(eventId, userId);
    setConnected(true);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const msg = await broadcast_chat_message(eventId, userId, username, input);
    setMessages(prev => [...prev, msg]);
    setInput('');
  };

  return (
    <div className="flex flex-col border rounded-lg w-80 h-96 bg-white shadow">
      <div className="p-2 border-b font-semibold text-sm">Event Chat</div>
      {!connected ? (
        <div className="flex flex-1 items-center justify-center">
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            Join Chat
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {messages.map((m, i) => (
              <div key={m.id ?? i} className={`text-sm ${m.flagged ? 'text-red-400' : ''}`}>
                <span className="font-medium">{m.username}: </span>
                {m.message}
              </div>
            ))}
          </div>
          <div className="flex border-t p-2 gap-2">
            <input
              className="flex-1 border rounded px-2 py-1 text-sm"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
            />
            <button
              onClick={handleSend}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
