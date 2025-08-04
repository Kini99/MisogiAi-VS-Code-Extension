import os
from typing import Optional

try:
    import openai
except ImportError:
    openai = None

try:
    import anthropic
except ImportError:
    anthropic = None

class LLMProvider:
    def __init__(self, provider: str = 'openai', api_key: Optional[str] = None):
        self.provider = provider
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')

    def call(self, prompt: str) -> str:
        if self.provider == 'openai' and openai:
            openai.api_key = self.api_key
            response = openai.ChatCompletion.create(
                model='gpt-3.5-turbo',
                messages=[{"role": "user", "content": prompt}],
                max_tokens=256
            )
            return response.choices[0].message['content']
        elif self.provider == 'anthropic' and anthropic:
            client = anthropic.Anthropic(api_key=self.api_key)
            response = client.messages.create(
                model='claude-3-opus-20240229',
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text
        else:
            return f"[Echo] {prompt}"
