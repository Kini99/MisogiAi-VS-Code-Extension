import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from typing import TypedDict, Annotated, List
from langchain_core.messages import AnyMessage, SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from langchain_core.tools import tool
from backend.tools import ReadFileTool, CreateFileTool, ListFilesTool, ReplaceTextTool, InsertTextTool, SearchAndReplaceTool, SemanticSearchTool, RegexSearchTool
import dotenv
import json
import re

dotenv.load_dotenv()

# Define the state for our graph
class AgentState(TypedDict):
    messages: Annotated[List[AnyMessage], lambda x, y: x + y]

# Initialize the LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    google_api_key=os.environ.get("GOOGLE_API_KEY")
).bind_tools([
    ReadFileTool(),
    CreateFileTool(),
    ListFilesTool(),
    ReplaceTextTool(),
    InsertTextTool(),
    SearchAndReplaceTool(),
    SemanticSearchTool(),
    RegexSearchTool()
])

# Define the agent node
def call_model(state: AgentState):
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def should_continue(state: AgentState):
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "continue"
    else:
        return "end"

def tool_node(state: AgentState):
    last_message = state["messages"][-1]
    
    # Check if the message has tool_calls
    if not hasattr(last_message, 'tool_calls') or not last_message.tool_calls:
        return {"messages": []}
    
    tool_outputs = []

    tools = {
        "read_file": ReadFileTool(),
        "create_file": CreateFileTool(),
        "list_files": ListFilesTool(),
        "replace_text": ReplaceTextTool(),
        "insert_text": InsertTextTool(),
        "search_and_replace": SearchAndReplaceTool(),
        "semantic_search": SemanticSearchTool(),
        "regex_search": RegexSearchTool(),
    }

    for tool_call in last_message.tool_calls:
        tool_name = tool_call.get("name")
        tool_args = tool_call.get("args", {})
        tool_id = tool_call.get("id")

        if tool_name in tools:
            try:
                result = tools[tool_name].invoke(tool_args) 
                tool_outputs.append(
                    ToolMessage(content=str(result), tool_call_id=tool_id)
                )
                tool_outputs.append(
                    AIMessage(content=f"{tool_name} executed successfully.")
                )
                # print(f"[TOOL_SUCCESS] {tool_name} executed successfully")
            except Exception as e:
                error_msg = f"Error running tool {tool_name}: {e}"
                tool_outputs.append(
                    ToolMessage(content=error_msg, tool_call_id=tool_id)
                )
                print(f"[TOOL_ERROR] {error_msg}", file=sys.stderr)
        else:
            error_msg = f"Unknown tool: {tool_name}"
            tool_outputs.append(
                ToolMessage(content=error_msg, tool_call_id=tool_id)
            )
            print(f"[TOOL_ERROR] {error_msg}", file=sys.stderr)

    return {"messages": tool_outputs}

# --- Smart Edit node (heuristic router) ---
def _parse_edit_intent(text: str):
    # very light heuristics; LLM can still tool-call normally
    m = re.search(r"replace\s+lines?\s+(\d+)(?:-(\d+))?\s+in\s+(?P<path>\S+)\s+with\s+```(.*?)```", text, re.S|re.I)
    if m:
        start = int(m.group(1)) - 1
        end = int(m.group(2) or m.group(1)) - 1
        new = m.group(4)
        return ("replace_text", {"filePath": m.group("path"),
                                 "startLine": start, "startChar": 0,
                                 "endLine": end+1, "endChar": 0, "newText": new})
    m = re.search(r"insert\s+at\s+cursor\s+in\s+(?P<path>\S+)\s+```(.*?)```", text, re.S|re.I)
    if m:
        # when cursor unknown, insert at (0,0) and let extension place at active cursor if open
        return ("insert_text", {"filePath": m.group("path"),
                                "lineNumber": 0, "charNumber": 0,
                                "text": m.group(2)})
    m = re.search(r"search\s*/\s*replace\s+in\s+(?P<path>\S+)\s+pattern\s+/(.*?)/\s+->\s+```(.*?)```", text, re.S|re.I)
    if m:
        return ("search_and_replace", {"filePath": m.group("path"),
                                       "searchRegex": m.group(2),
                                       "replaceText": m.group(3)})
    return None

def smart_edit_node(state: AgentState):
    # If LLM already produced tool calls, skip
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return {"messages": []}
    # Try to parse user's latest instruction for a direct edit
    # Walk messages backwards to find the latest HumanMessage
    from langchain_core.messages import HumanMessage
    human = next((m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None)
    if not human: 
        return {"messages": []}
    parsed = _parse_edit_intent(human.content if isinstance(human.content, str) else "")
    if not parsed:
        return {"messages": []}
    tool_name, tool_args = parsed
    tools = {
        "replace_text": ReplaceTextTool(),
        "insert_text": InsertTextTool(),
        "search_and_replace": SearchAndReplaceTool(),
    }
    try:
        res = tools[tool_name].invoke(tool_args)
        return {"messages": [ToolMessage(content=str(res), tool_call_id=f"smart::{tool_name}")]}
    except Exception as e:
        return {"messages": [ToolMessage(content=f"SmartEdit error: {e}", tool_call_id=f"smart::{tool_name}")]}


# Build the graph
graph_builder = StateGraph(AgentState)
graph_builder.add_node("agent", call_model)
graph_builder.add_node("tools", tool_node)

graph_builder.set_entry_point("agent")

graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {"continue": "tools", "end": "smart_edit"}
)
graph_builder.add_node("smart_edit", smart_edit_node)
graph_builder.add_edge("tools", "agent")
# After smart_edit, go back to agent for follow-ups or finish
graph_builder.add_edge("smart_edit", "agent")

graph = graph_builder.compile()

def process_input_line(line: str):
    try:
        history_json = json.loads(line)

        # Reconstruct messages
        messages = []
        for msg in history_json:
            if msg['role'] == 'user':
                messages.append(HumanMessage(content=msg['content']))
            elif msg['role'] == 'assistant':
                messages.append(AIMessage(content=msg['content']))

        # Add a system prompt
        initial_state = {
            "messages": [
                SystemMessage(content="You are a helpful AI assistant inside VS Code. Be concise and provide code snippets when relevant."),
            ] + messages
        }

        final_state = graph.invoke(initial_state)

        serializable_messages = []
        for msg in final_state['messages']:
            content = msg.content if msg.content else "Changes applied successfully."
            serializable_messages.append({"type": msg.type, "content": content})
        sys.stdout.flush()

    except Exception as e:
        print(f"[PYTHON_ERROR] {str(e)}", file=sys.stderr)
        sys.stderr.flush()

def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        process_input_line(line.strip())

if __name__ == "__main__":
    main()
