// webview-ui/main.js

// --- Foolproof Test: If you don't see this alert after reloading, your changes are NOT being applied. ---
alert('The NEW main.js file has loaded!');

const vscode = acquireVsCodeApi();

const messageHistory = document.getElementById('message-history');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (event) => {
    // Use '&&' for the shiftKey check
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const text = messageInput.value;
    if (text.trim() === '') return;

    addMessage('user', text);
    
    vscode.postMessage({
        command: 'sendMessage',
        text: text
    });

    messageInput.value = '';
    showTypingIndicator();
}

/**
 * THIS IS THE CORRECTED FUNCTION.
 * It safely creates HTML elements instead of manually building strings,
 * which is more secure and avoids escaping issues entirely.
 */
function addMessage(role, text) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${role}`;

    // Split the text by code blocks to handle them separately
    const parts = text.split(/(```[\s\S]*?```)/g);

    parts.forEach(part => {
        if (part.startsWith('```') && part.endsWith('```')) {
            // This part is a code block
            const codeContent = part.slice(3, -3).trim(); // Extract content from backticks
            
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            
            // Use .textContent - The browser handles sanitization automatically and safely
            code.textContent = codeContent; 
            
            pre.appendChild(code);
            messageElement.appendChild(pre);
        } else if (part) {
            // This is a regular text part. Create a text node to be safe.
            const textNode = document.createTextNode(part);
            messageElement.appendChild(textNode);
        }
    });

    messageHistory.appendChild(messageElement);
    messageHistory.scrollTop = messageHistory.scrollHeight;
}


function showTypingIndicator() {
    const existingIndicator = document.getElementById('typing-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.className = 'message assistant';
    typingIndicator.textContent = '● ● ●';
    messageHistory.appendChild(typingIndicator);
    messageHistory.scrollTop = messageHistory.scrollHeight;
}

function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

window.addEventListener('message', event => {
    const message = event.data;
    removeTypingIndicator();

    switch (message.command) {
        case 'addMessage':
            addMessage(message.role, message.text);
            break;
        case 'showError':
            const errorElement = document.createElement('div');
            errorElement.className = 'message error';
            errorElement.textContent = message.text; // Use textContent for safety
            messageHistory.appendChild(errorElement);
            break;
    }
});