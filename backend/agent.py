import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from typing import TypedDict, Annotated, List
from langchain_core.messages import AnyMessage, SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from langchain_core.tools import tool
from backend.tools import ReadFileTool, CreateFileTool, ListFilesTool
import dotenv
import json

dotenv.load_dotenv()

# Define the state for our graph
class AgentState(TypedDict):
    messages: Annotated[List[AnyMessage], lambda x, y: x + y]

# Initialize the LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=os.environ.get("GOOGLE_API_KEY")
).bind_tools([ReadFileTool(), CreateFileTool(), ListFilesTool()])

# Define the agent node
def call_model(state: AgentState):
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

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
                print(f"[TOOL_SUCCESS] {tool_name} executed successfully")
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

# Build the graph
graph_builder = StateGraph(AgentState)
graph_builder.add_node("agent", call_model)
graph_builder.add_node("tools", tool_node)

graph_builder.set_entry_point("agent")

graph_builder.add_conditional_edges(
    "agent",
    lambda state: "tools" if state["messages"][-1].tool_calls else END,
    {"tools": "tools", END: END}
)
graph_builder.add_edge("tools", "agent")

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

        # Serialize response
        serializable_messages = [
            {"type": msg.type, "content": msg.content}
            for msg in final_state['messages']
        ]

        print(json.dumps({"messages": serializable_messages}))
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
