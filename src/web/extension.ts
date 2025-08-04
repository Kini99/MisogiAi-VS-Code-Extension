// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { saveChatHistory, getChatHistory } from './chatStorage';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('AI Chat extension is now active!');

  // Function to open the chat panel
  const openChatPanel = () => {
	const panel = vscode.window.createWebviewPanel(
	  'aiChatWebview',
	  'AI Chat',
	  vscode.ViewColumn.One,
	  {
		enableScripts: true,
		localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')]
	  }
	);

	// Path to built JS (assume esbuild outputs to out/webview/index.js)
	const scriptUri = panel.webview.asWebviewUri(
	  vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'index.js')
	);
	const htmlUri = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'index.html');

	// Read the HTML and inject the script URI
	vscode.workspace.fs.readFile(htmlUri).then(data => {
	  let html = Buffer.from(data).toString('utf8');
	  html = html.replace('./index.js', scriptUri.toString());
	  panel.webview.html = html;
	});

	// Load chat history and send to webview
	const history = getChatHistory(context);
	panel.webview.postMessage({ type: 'history', history });

	// Handle messages from the webview
	panel.webview.onDidReceiveMessage(
	  async message => {
		if (message.type === 'chat') {
		  const updatedHistory = [...getChatHistory(context), { role: 'user', content: message.content, timestamp: message.timestamp }];
		  panel.webview.postMessage({ type: 'typing' });
		  // Call Python FastAPI backend
		  try {
			const res = await fetch('http://localhost:8000/chat', {
			  method: 'POST',
			  headers: { 'Content-Type': 'application/json' },
			  body: JSON.stringify({ history: updatedHistory, user_input: message.content })
			});
			if (!res.ok) { throw new Error('Backend error'); }
			const data = await res.json();
			await saveChatHistory(context, data.history);
			panel.webview.postMessage({ type: 'agent', content: data.response, timestamp: new Date().toISOString() });
			panel.webview.postMessage({ type: 'history', history: data.history });
		  } catch (err) {
			panel.webview.postMessage({ type: 'agent', content: '[Error: Backend not running]', timestamp: new Date().toISOString() });
		  }
		} else if (message.type === 'clear') {
		  await saveChatHistory(context, []);
		  panel.webview.postMessage({ type: 'history', history: [] });
		}
	  },
	  undefined,
	  context.subscriptions
	);
  };

  // Register the command to open the chat panel
  const disposable = vscode.commands.registerCommand('ai-chat.openChat', openChatPanel);
  context.subscriptions.push(disposable);

  // Auto-open the chat panel on activation
  openChatPanel();
}

// This method is called when your extension is deactivated
export function deactivate() {}
