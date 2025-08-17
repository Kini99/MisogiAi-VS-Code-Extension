from langchain.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
from typing import Optional
import json
import sys
import os

# detect VS Code workspace root - get from environment variable set by extension
WORKSPACE_ROOT = os.environ.get('VSCODE_WORKSPACE_ROOT', os.getcwd())

# Add this function to check workspace status
def check_workspace():
    """Check if we have a valid workspace"""
    if not os.environ.get('VSCODE_WORKSPACE_ROOT'):
        return "No VS Code workspace is currently open. Please open a folder in VS Code first."
    return None

# ------------------------------
# Shared helper to send command and wait for result
# ------------------------------
def send_command_and_wait(command: dict):
    """
    Sends a JSON command to the VS Code extension via stdout
    and waits for the response from stdin until 'END_OF_TOOL_OUTPUT'.
    """
    # Send command to extension
    sys.stdout.write(json.dumps(command) + "\n")
    sys.stdout.flush()

    # Collect response lines
    response_lines = []
    for line in sys.stdin:
        if line.strip() == "END_OF_TOOL_OUTPUT":
            break
        response_lines.append(line.strip())

    if not response_lines:
        return "No response received from VS Code."

    try:
        response_json = json.loads("".join(response_lines))
    except Exception as e:
        return f"Failed to parse VS Code response: {e}"

    if response_json.get("error"):
        return f"Error: {response_json['error']}"

    return response_json.get("tool_output", "No output returned.")


# ------------------------------
# READ FILE TOOL
# ------------------------------
class ReadFileArgsSchema(BaseModel):
    path: str = Field(description="The path to the file to read.")


class ReadFileTool(BaseTool):
    name:str = "read_file"
    description:str = "Reads the content of a specified file."
    args_schema: Type[BaseModel] = ReadFileArgsSchema

    def _run(self, path: str):
        workspace_error = check_workspace()
        if workspace_error:
            return workspace_error
        abs_path = os.path.join(WORKSPACE_ROOT, path)
        command = {"command": "readFile", "path": abs_path}
        return send_command_and_wait(command)


# ------------------------------
# CREATE FILE TOOL
# ------------------------------
class CreateFileArgsSchema(BaseModel):
    path: str = Field(description="The path to the new file.")
    content: str = Field(description="The content to write to the new file.")


class CreateFileTool(BaseTool):
    name:str = "create_file"
    description:str = "Creates a new file with the specified content."
    args_schema: Type[BaseModel] = CreateFileArgsSchema

    def _run(self, path: str, content: str):
        workspace_error = check_workspace()
        if workspace_error:
            return workspace_error
        abs_path = os.path.join(WORKSPACE_ROOT, path)
        command = {"command": "createFile", "path": abs_path, "content": content}
        return send_command_and_wait(command)


# ------------------------------
# LIST FILES TOOL
# ------------------------------
class ListFilesArgsSchema(BaseModel):
    path: str = Field(description="The path to the directory to list.")


class ListFilesTool(BaseTool):
    name:str = "list_files"
    description:str = "Lists the contents of a specified directory."
    args_schema: Type[BaseModel] = ListFilesArgsSchema

    def _run(self, path: str):
        workspace_error = check_workspace()
        if workspace_error:
            return workspace_error
        abs_path = os.path.join(WORKSPACE_ROOT, path)
        command = {"command": "listFiles", "path": abs_path}
        return send_command_and_wait(command)


# ------------------------------
# REPLACE TEXT TOOL
# ------------------------------
class ReplaceTextArgsSchema(BaseModel):
    filePath: str = Field(description="The path to the file to modify.")
    startLine: int = Field(description="The starting line number (0-indexed).")
    startChar: int = Field(description="The starting character number (0-indexed).")
    endLine: int = Field(description="The ending line number (0-indexed).")
    endChar: int = Field(description="The ending character number (0-indexed).")
    newText: str = Field(description="The new text to insert.")


class ReplaceTextTool(BaseTool):
    name: str = "replace_text"
    description: str = "Replaces text in a specific range within a file."
    args_schema: Type[BaseModel] = ReplaceTextArgsSchema

    def _run(self, filePath: str, startLine: int, startChar: int, endLine: int, endChar: int, newText: str):
        workspace_error = check_workspace()
        if workspace_error:
            return workspace_error
        command = {
            "command": "replaceText",
            "filePath": os.path.join(WORKSPACE_ROOT, filePath),
            "startLine": startLine,
            "startChar": startChar,
            "endLine": endLine,
            "endChar": endChar,
            "newText": newText
        }
        return send_command_and_wait(command)


# ------------------------------
# INSERT TEXT TOOL
# ------------------------------
class InsertTextArgsSchema(BaseModel):
    filePath: str = Field(description="The path to the file to modify.")
    lineNumber: int = Field(description="The line number to insert at (0-indexed).")
    charNumber: int = Field(description="The character number to insert at (0-indexed).")
    text: str = Field(description="The text to insert.")


class InsertTextTool(BaseTool):
    name: str = "insert_text"
    description: str = "Inserts text at a specific position within a file."
    args_schema: Type[BaseModel] = InsertTextArgsSchema

    def _run(self, filePath: str, lineNumber: int, charNumber: int, text: str):
        workspace_error = check_workspace()
        if workspace_error:
            return workspace_error
        command = {
            "command": "insertText",
            "filePath": os.path.join(WORKSPACE_ROOT, filePath),
            "lineNumber": lineNumber,
            "charNumber": charNumber,
            "text": text
        }
        return send_command_and_wait(command)


# ------------------------------
# SEARCH AND REPLACE TOOL
# ------------------------------
class SearchAndReplaceArgsSchema(BaseModel):
    filePath: str = Field(description="The path to the file to modify.")
    searchRegex: str = Field(description="The regex pattern to search for.")
    replaceText: str = Field(description="The text to replace matches with.")


class SearchAndReplaceTool(BaseTool):
    name: str = "search_and_replace"
    description: str = "Performs a regex-based search and replace operation within a file."
    args_schema: Type[BaseModel] = SearchAndReplaceArgsSchema

    def _run(self, filePath: str, searchRegex: str, replaceText: str):
        workspace_error = check_workspace()
        if workspace_error:
            return workspace_error
        command = {
            "command": "searchAndReplace",
            "filePath": os.path.join(WORKSPACE_ROOT, filePath),
            "searchRegex": searchRegex,
            "replaceText": replaceText
        }
        return send_command_and_wait(command)


# ------------------------------
# SEMANTIC SEARCH TOOL
# ------------------------------
class SemanticSearchArgsSchema(BaseModel):
    query: str = Field(description="The semantic query for code search.")


class SemanticSearchTool(BaseTool):
    name: str = "semantic_search"
    description: str = "Performs a semantic code search using VS Code's symbol provider."
    args_schema: Type[BaseModel] = SemanticSearchArgsSchema

    def _run(self, query: str):
        workspace_error = check_workspace()
        if workspace_error:
            return workspace_error
        command = {"command": "semanticSearch", "query": query}
        return send_command_and_wait(command)


# ------------------------------
# REGEX SEARCH TOOL
# ------------------------------
class RegexSearchArgsSchema(BaseModel):
    query: str = Field(description="The regex pattern to search for.")
    filePath: Optional[str] = Field(default=None, description="Optional: The path to a specific file to search within.")

class RegexSearchTool(BaseTool):
    name: str = "regex_search"
    description: str = "Performs a regex-based code search."
    args_schema: Type[BaseModel] = RegexSearchArgsSchema

    def _run(self, query: str, filePath: str = None):
        workspace_error = check_workspace()
        if workspace_error:
            return workspace_error
        command = {"command": "regexSearch", "query": query}
        if filePath:
            command["filePath"] = os.path.join(WORKSPACE_ROOT, filePath)
        return send_command_and_wait(command)


# ------------------------------
# For direct testing
# ------------------------------
if __name__ == "__main__":
    # Example: Try reading a file (when extension is running)
    tool = ReadFileTool()
    print(tool._run("README.md"))
