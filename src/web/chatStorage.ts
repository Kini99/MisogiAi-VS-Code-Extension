import * as vscode from 'vscode';

const CHAT_KEY = 'aiChat.history';

export async function saveChatHistory(context: vscode.ExtensionContext, history: any[]) {
  await context.globalState.update(CHAT_KEY, history);
}

export function getChatHistory(context: vscode.ExtensionContext): any[] {
  return context.globalState.get(CHAT_KEY, []);
}
