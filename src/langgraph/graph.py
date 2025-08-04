from langgraph.graph import StateGraph

# Placeholder handler imports (to be implemented)
from .handlers import input_handler, processor, call_llm, response_handler

builder = StateGraph()
builder.add_node("input", input_handler)
builder.add_node("process", processor)
builder.add_node("llm", call_llm)
builder.add_node("response", response_handler)
builder.set_entry_point("input")
builder.set_finish_point("response")
graph = builder.compile()
