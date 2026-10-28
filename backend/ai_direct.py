"""Cliente de IA direto: texto, visão e SSE, sem SDK privado da Emergent."""
from dataclasses import dataclass, field
import json
import os
import httpx


@dataclass
class ImageContent:
    image_base64: str


@dataclass
class UserMessage:
    text: str
    file_contents: list = field(default_factory=list)


@dataclass
class TextDelta:
    content: str


@dataclass
class StreamDone:
    pass


class LlmChat:
    def __init__(self, api_key, session_id, system_message, initial_messages=None):
        self.json_mode = False
        self.api_key = api_key
        self.messages = list(initial_messages) if initial_messages is not None else [{'role': 'system', 'content': system_message}]
        self.groq = bool(os.environ.get('GROQ_API_KEY'))
        self.model = os.environ['GROQ_MODEL' if self.groq else 'OPENAI_MODEL']
        self.endpoint = 'https://api.groq.com/openai/v1/chat/completions' if self.groq else 'https://api.openai.com/v1/chat/completions'

    def with_model(self, provider, model):
        # O modelo é escolhido no backend; não reutiliza aliases específicos da Emergent.
        return self

    def payload(self, message, stream=False):
        content = message.text
        if message.file_contents:
            content = [{'type': 'text', 'text': message.text}]
            for image in message.file_contents:
                b64 = image.image_base64
                prefix = 'image/jpeg'
                if b64.startswith('iVBOR'): prefix = 'image/png'
                elif b64.startswith('UklGR'): prefix = 'image/webp'
                content.append({'type': 'image_url', 'image_url': {'url': f'data:{prefix};base64,{b64}'}})
        model = os.environ.get('GROQ_VISION_MODEL' if self.groq else 'OPENAI_VISION_MODEL', self.model) if message.file_contents else self.model
        payload = {'model': model, 'messages': self.messages + [{'role': 'user', 'content': content}],
                   'stream': stream, 'max_completion_tokens': 2000}
        if self.json_mode and not stream:
            payload["response_format"] = {"type": "json_object"}
        if self.groq:
            if model.startswith('qwen/'):
                payload['reasoning_effort'] = 'none'
            elif model.startswith('openai/gpt-oss'):
                payload['reasoning_effort'] = 'low'
        else:
            payload['store'] = False
        return payload

    async def send_message(self, message):
        async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=10)) as client:
            response = await client.post(self.endpoint, headers={'Authorization': f'Bearer {self.api_key}'}, json=self.payload(message))
            response.raise_for_status()
            data = response.json()
            text = data['choices'][0]['message'].get('content')
            if not isinstance(text, str) or not text.strip():
                raise ValueError('Resposta vazia da IA')
            return text

    async def stream_message(self, message):
        async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=10)) as client:
            async with client.stream('POST', self.endpoint, headers={'Authorization': f'Bearer {self.api_key}'}, json=self.payload(message, True)) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith('data:'): continue
                    raw = line[5:].strip()
                    if not raw: continue
                    if raw == '[DONE]':
                        yield StreamDone()
                        return
                    data = json.loads(raw)
                    if data.get('error'): raise ValueError('Falha no provedor de IA')
                    choices = data.get('choices') or []
                    if choices:
                        delta = choices[0].get('delta', {}).get('content')
                        if delta: yield TextDelta(delta)
        yield StreamDone()

