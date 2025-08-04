import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './types';

const vscode = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : undefined;

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'agent') {
        setMessages(prev => [...prev, { role: 'agent', content: msg.content, timestamp: msg.timestamp }]);
        setLoading(false);
      } else if (msg.type === 'history') {
        setMessages(msg.history || []);
        setLoading(false);
      } else if (msg.type === 'typing') {
        setLoading(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) {
      setError('Message cannot be empty');
      return;
    }
    const msg: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, msg]);
    setInput('');
    setLoading(true);
    setError(null);
    vscode?.postMessage({ type: 'chat', content: msg.content, timestamp: msg.timestamp });
  };

  const clearChat = () => {
    vscode?.postMessage({ type: 'clear' });
    setMessages([]);
    setInput('');
    setError(null);
  };

  return (
    <div className="flex flex-col h-full w-full">
      <header className="bg-blue-600 text-white p-4 text-lg font-bold flex items-center justify-between">
        <span>AI Chat</span>
        <button className="text-xs bg-white text-blue-600 border border-blue-600 rounded px-2 py-1 ml-2" onClick={clearChat}>Clear</button>
      </header>
      <main ref={chatListRef} className="flex-1 p-4 overflow-y-auto space-y-2" id="chat-list">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded px-3 py-2 max-w-[70%] ${m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-900'}`}>
              <div>{m.content}</div>
              <div className="text-xs text-gray-400 mt-1 text-right">{new Date(m.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded px-3 py-2 bg-gray-200 text-gray-900 animate-pulse">Typing...</div>
          </div>
        )}
      </main>
      <footer className="p-4 bg-white flex gap-2 border-t">
        <input
          className="flex-1 border rounded px-2 py-1"
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          disabled={loading}
        />
        <button
          className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
          onClick={sendMessage}
          disabled={loading}
        >Send</button>
      </footer>
      {error && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded shadow">
          {error}
          <button className="ml-2" onClick={() => setError(null)}>x</button>
        </div>
      )}
    </div>
  );
};

export default App;
