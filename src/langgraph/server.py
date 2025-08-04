from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .graph import graph
from .state import ConversationState
from typing import List, Dict, Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    history: List[Dict[str, str]]
    user_input: str

class ChatResponse(BaseModel):
    response: str
    history: List[Dict[str, str]]

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    state = ConversationState(history=req.history, user_input=req.user_input, response=None)
    result = graph.invoke(state)
    return ChatResponse(response=result.response, history=result.history)

# To run: uvicorn src.langgraph.server:app --reload
