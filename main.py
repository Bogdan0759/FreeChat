import uvicorn
import os
from fastapi import FastAPI
import socketio
from socketio import ASGIApp
from api import router
from util.socket_events import sio, setup_socket_events
from fastapi.staticfiles import StaticFiles

os.makedirs("chats", exist_ok=True)
os.makedirs("templates", exist_ok=True)
os.makedirs("static/avatars", exist_ok=True)

app = FastAPI(title="FreeChat Messenger")
app.mount("/static", StaticFiles(directory="static"), name="static")

setup_socket_events(sio)
socket_app = ASGIApp(sio, app)
app.include_router(router)

if __name__ == "__main__":
    print("FreeChat Messenger запущен!")

    uvicorn.run(
        socket_app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )
