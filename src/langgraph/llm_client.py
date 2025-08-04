from .llm_provider import LLMProvider
from typing import Optional

class LLMClient:
    def __init__(self, api_key: Optional[str] = None, provider: str = 'openai'):
        self.provider = LLMProvider(provider=provider, api_key=api_key)

    def call(self, prompt: str) -> str:
        return self.provider.call(prompt)
