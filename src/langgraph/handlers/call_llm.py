def call_llm(state):
    # Call LLM with proper prompt
    return state
from ..state import ConversationState
from ..llm_client import LLMClient

def call_llm(state: ConversationState) -> ConversationState:
    # Call LLM (echo agent for now)
    client = LLMClient()
    state.response = client.call(state.user_input)
    return state
