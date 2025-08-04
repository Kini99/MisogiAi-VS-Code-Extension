from dataclasses import dataclass
from typing import List, Dict, Optional

@dataclass
class ConversationState:
    history: List[Dict[str, str]]
    user_input: str
    response: Optional[str]
