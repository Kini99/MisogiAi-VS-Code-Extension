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

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      if (!workspaceRoot) {
        vscode.window.showErrorMessage("No workspace folder is open. Please open a folder in VS Code first.");
        currentPanel?.dispose();
        return;
      }

      console.log(`[WORKSPACE] Using workspace root: ${workspaceRoot}`);

      // Spawn the Python process.
      // CRITICAL: shell is false (the default), cwd is set.
      pythonProcess = spawn(pythonPath, ["-u", scriptPath], {
        cwd: context.extensionPath, // Set the working directory
        env: {
          ...process.env,
          VSCODE_WORKSPACE_ROOT: workspaceRoot  // Pass workspace to Python
        }
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
          if (response.command) {
            // Handle commands from the Python backend (e.g., tool calls)
            handlePythonCommand(response, currentPanel, pythonProcess);
          } else if (response.messages) {
            // Handle regular AI messages
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
            } else if (aiMessage && aiMessage.tool_calls) {
              // Handle tool calls from the AI model
              // The Python agent will send these back after processing the tool_node
              // We don't need to do anything here as the tool_node in Python handles it.
              console.log("[FROM_PYTHON_STDOUT] AI wants to call a tool:", aiMessage.tool_calls);
            } else if (aiMessage && aiMessage.tool_output) {
              // Handle tool output from the AI model (after tool execution)
              console.log("[FROM_PYTHON_STDOUT] AI tool output:", aiMessage.tool_output);
              currentPanel?.webview.postMessage({
                command: "addMessage",
                role: "assistant",
                text: `Tool output: ${JSON.stringify(aiMessage.tool_output)}`,
              });
            }
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

async function handlePythonCommand(
  command: any,
  panel: vscode.WebviewPanel | undefined,
  pythonProc: ChildProcessWithoutNullStreams | undefined
) {
  if (!panel || !pythonProc) {
    console.error("Panel or Python process not available.");
    return;
  }

  const { command: cmd, path, content, tool_call_id } = command;
  let result: any;
  let error: string | undefined;

  try {
    if (cmd === "readFile") {
      const uri = vscode.Uri.file(path);
      const fileContent = await vscode.workspace.fs.readFile(uri);
      result = Buffer.from(fileContent).toString('utf8');
      console.log(`[VSCODE_FS] Read file ${path}`);
    } else if (cmd === "createFile") {
      const uri = vscode.Uri.file(path);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      result = `File ${path} created successfully.`;
      console.log(`[VSCODE_FS] Created file ${path}`);
    } else if (cmd === "listFiles") {
      const uri = vscode.Uri.file(path);
      const files = await vscode.workspace.fs.readDirectory(uri);
      result = files.map(([name, type]) => ({
        name,
        type: type === vscode.FileType.Directory ? "directory" : "file",
      }));
      console.log(`[VSCODE_FS] Listed directory ${path}`);
    } else {
      error = `Unknown command: ${cmd}`;
      console.error(`[VSCODE_FS_ERROR] ${error}`);
    }
  } catch (e: any) {
    error = e.message;
    console.error(`[VSCODE_FS_ERROR] Error executing command ${cmd}: ${error}`);
  }

  // Send the result back to the Python process
  const responsePayload = JSON.stringify({
    tool_output: result,
    tool_call_id: tool_call_id,
    error: error,
  });
  pythonProc.stdin.write(responsePayload + "\n");
  pythonProc.stdin.write("END_OF_TOOL_OUTPUT\n"); // Delimiter
  console.log(`[TO_PYTHON] Sent tool output for ${cmd}.`);
}

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
