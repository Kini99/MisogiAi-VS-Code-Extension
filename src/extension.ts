import * as vscode from "vscode";
import * as path from "path"; // It's safe to import path at the top level
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

// --- GLOBAL VARIABLES ---
// These will hold the state of our panel and python process
let currentPanel: vscode.WebviewPanel | undefined;
let pythonProcess: ChildProcessWithoutNullStreams | undefined;

const API_KEY_SECRET_KEY = "GOOGLE_API_KEY";

export function activate(context: vscode.ExtensionContext) {
  // THIS IS THE FIRST LOG YOU SHOULD SEE. IF YOU DON'T, THE EXTENSION IS CRASHING.
  console.log('[SUCCESS] Extension "langgraph-ai-assistant" is now active!');

  let setApiKeyCommand = vscode.commands.registerCommand(
    "langgraph-ai-assistant.setApiKey",
    async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your GOOGLE API Key",
        password: true,
        ignoreFocusOut: true,
      });

      if (apiKey) {
        await context.secrets.store(API_KEY_SECRET_KEY, apiKey);
        vscode.window.showInformationMessage("API Key stored successfully.");
      }
    }
  );
  let startCommand = vscode.commands.registerCommand(
    "langgraph-ai-assistant.start",
    () => {
      // If the panel already exists, just reveal it.
      if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
        return;
      }

      // Otherwise, create a new panel.
      currentPanel = vscode.window.createWebviewPanel(
        "aiAssistantChat",
        "AI Assistant",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "webview-ui"),
          ],
          retainContextWhenHidden: true, // Keep the webview state even when it's not visible
        }
      );

      currentPanel.webview.html = getWebviewContent(
        context,
        currentPanel.webview
      );

      // --- START OF THE ROBUST PYTHON LAUNCH ---

      // Construct the absolute path to the venv python executable.
      // This is more reliable than a hardcoded path.
      const pythonPath = path.join(
        context.extensionPath, // The root directory of YOUR extension
        ".venv",
        "Scripts",
        "python.exe"
      );

      const scriptPath = path.join(
        context.extensionPath,
        "backend",
        "agent.py"
      );

      console.log(`[SPAWN_ATTEMPT] Attempting to spawn Python process.`);
      console.log(`[SPAWN_ATTEMPT] Executable: ${pythonPath}`);
      console.log(`[SPAWN_ATTEMPT] Script: ${scriptPath}`);

      // Spawn the Python process.
      // CRITICAL: shell is false (the default), cwd is set.
      pythonProcess = spawn(pythonPath, ["-u", scriptPath], {
        cwd: context.extensionPath, // Set the working directory
      });

      // --- EVENT LISTENERS TO DIAGNOSE ANY ISSUE ---

      // This event fires if the process CANNOT BE SPAWNED.
      // This is where the "file not found" error would truly appear.
      pythonProcess.on("error", (err) => {
        console.error("[SPAWN_ERROR] Failed to start Python process.", err);
        vscode.window.showErrorMessage(
          `Failed to start AI backend: ${err.message}. Check the path and venv.`
        );
        currentPanel?.dispose();
      });

      let conversationHistory: any[] = [];

      // Handle incoming data from the Python script's standard output
      pythonProcess.stdout.on("data", (data) => {
        const responseData = data.toString();
        console.log(`[FROM_PYTHON_STDOUT] Raw data: ${responseData}`);
        try {
          const response = JSON.parse(responseData);
          const aiMessage = response.messages.slice(-1)[0];
          if (aiMessage && aiMessage.content) {
            conversationHistory.push({
              role: "assistant",
              content: aiMessage.content,
            });
            currentPanel?.webview.postMessage({
              command: "addMessage",
              role: "assistant",
              text: aiMessage.content,
            });
          }
        } catch (e) {
          console.error(
            "[JSON_PARSE_ERROR] Failed to parse response from backend.",
            e,
            "Raw data:",
            responseData
          );
        }
      });

      // Handle incoming data from the Python script's standard error
      pythonProcess.stderr.on("data", (data) => {
        console.error(`[FROM_PYTHON_STDERR] ${data.toString()}`);
        // Also show this error in the webview for better visibility
        currentPanel?.webview.postMessage({
          command: "showError",
          text: `Backend Error: ${data.toString()}`,
        });
      });

      // Handle the process closing
      pythonProcess.on("close", (code) => {
        console.log(`[PROCESS_CLOSE] Python process exited with code ${code}.`);
        if (code !== 0 && currentPanel) {
          vscode.window.showErrorMessage(
            `AI backend process stopped unexpectedly with code ${code}.`
          );
        }
        pythonProcess = undefined; // Clear the process variable
      });

      // --- WEBVIEW MESSAGE HANDLER ---
      currentPanel.webview.onDidReceiveMessage(
        (message) => {
          if (message.command === "sendMessage") {
            if (pythonProcess) {
              conversationHistory.push({ role: "user", content: message.text });
              const payload = JSON.stringify(conversationHistory);
              pythonProcess.stdin.write(payload + "\n");
              console.log(`[TO_PYTHON] Sent conversation history.`);
            } else {
              vscode.window.showErrorMessage(
                "AI Assistant backend is not running."
              );
            }
          }
        },
        undefined,
        context.subscriptions
      );

      // Clean up when the panel is closed
      currentPanel.onDidDispose(
        () => {
          console.log("[PANEL_DISPOSED] Killing Python process.");
          pythonProcess?.kill();
          pythonProcess = undefined;
          currentPanel = undefined;
        },
        null,
        context.subscriptions
      );
    }
  );

  context.subscriptions.push(startCommand, setApiKeyCommand);
}

// This function can be simplified as it's only used once.
function getWebviewContent(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): string {
  const stylesUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "webview-ui", "styles.css")
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "webview-ui", "main.js")
  );

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
            <div id="message-history"></div>
            <div id="input-container">
                <textarea id="message-input" placeholder="Ask a question..."></textarea>
                <button id="send-button">Send</button>
            </div>
        </div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
}

export function deactivate() {
  console.log("[DEACTIVATING] Killing Python process if it exists.");
  pythonProcess?.kill();
}
