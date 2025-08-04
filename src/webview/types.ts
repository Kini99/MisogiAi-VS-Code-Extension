export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}
