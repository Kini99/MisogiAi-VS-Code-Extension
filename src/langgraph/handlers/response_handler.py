def response_handler(state):
    # Return data to extension
    return state
from ..state import ConversationState

def response_handler(state: ConversationState) -> ConversationState:
    # Add agent response to history
    if state.response:
        state.history.append({'role': 'agent', 'content': state.response})
    return state
