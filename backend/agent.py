import sys
import json
import os
from typing import TypedDict, Annotated, List
from langchain_core.messages import AnyMessage, SystemMessage, HumanMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
import dotenv

dotenv.load_dotenv()

# Define the state for our graph
class AgentState(TypedDict):
    messages: Annotated[List[AnyMessage], lambda x, y: x + y]

# Initialize the LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",
    google_api_key=os.environ.get("GOOGLE_API_KEY")
)

# Define the agent node
def call_model(state: AgentState):
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

# Build the graph
graph_builder = StateGraph(AgentState)
graph_builder.add_node("agent", call_model)
graph_builder.set_entry_point("agent")
graph_builder.add_edge("agent", END)

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
