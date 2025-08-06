import * as vscode from 'vscode';

export function getWebviewContent(stylesUri: vscode.Uri, scriptUri: vscode.Uri): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesUri}" rel="stylesheet">
        <title>AI Assistant</title>
    </head>
    <body>
        <div id="chat-container">
            <div id="message-history">
                <!-- Messages will be added here -->
            </div>
            <div id="input-container">
                <textarea id="message-input" placeholder="Ask a question about your code..."></textarea>
                <button id="send-button">Send</button>
            </div>
        </div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
}