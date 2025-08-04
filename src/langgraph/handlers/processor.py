def processor(state):
    # Add metadata/context/state
    return state
from ..state import ConversationState

def processor(state: ConversationState) -> ConversationState:
    # Add user message to history
    state.history.append({'role': 'user', 'content': state.user_input})
    return state
