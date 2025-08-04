def input_handler(state):
    # Validate and format user input
    return state
from ..state import ConversationState

def input_handler(state: ConversationState) -> ConversationState:
    # Validate and format user input
    if not state.user_input or not state.user_input.strip():
        raise ValueError('User input is empty')
    return state
