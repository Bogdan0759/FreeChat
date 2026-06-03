from fastapi import FastAPI, Request, Form, HTTPException, Depends, Cookie
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
import socketio
import uvicorn
import os
import hashlib
from datetime import datetime
from typing import Dict, List, Optional

# Создаем директории
os.makedirs("chats", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Socket.IO сервер
sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    async_mode='asgi',
    logger=False,
    engineio_logger=False
)

app = FastAPI(title="FreeChat Messenger")
socket_app = socketio.ASGIApp(sio, app)
templates = Jinja2Templates(directory="templates")

app.mount("/static", StaticFiles(directory="static"), name="static")

# Хранилище активных пользователей
active_users: Dict[str, dict] = {}
# Добавьте эти импорты в начало файла
import shutil
import json
from pathlib import Path

# Добавьте после других словарей
user_profiles: Dict[str, dict] = {}  # Хранилище профилей пользователей

# Функции для работы с профилями пользователей
def load_user_profiles():
    """Загружает профили пользователей из файла"""
    profiles_file = "chats/user_profiles.json"
    if os.path.exists(profiles_file):
        try:
            with open(profiles_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_user_profiles(profiles):
    """Сохраняет профили пользователей в файл"""
    profiles_file = "chats/user_profiles.json"
    try:
        with open(profiles_file, "w", encoding="utf-8") as f:
            json.dump(profiles, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving profiles: {e}")

def get_user_profile(username: str) -> dict:
    """Получает профиль пользователя"""
    profiles = load_user_profiles()
    if username not in profiles:
        # Создаем профиль по умолчанию
        profiles[username] = {
            "username": username,
            "avatar": f"/static/avatars/default_{hash(username) % 8 + 1}.png",
            "bio": "",
            "created_at": datetime.now().isoformat()
        }
        save_user_profiles(profiles)
    return profiles[username]

def update_username(old_username: str, new_username: str) -> bool:
    """Обновляет имя пользователя во всех файлах"""
    if not new_username or len(new_username) < 3 or len(new_username) > 20:
        return False
    
    # Обновляем в users.txt
    users_file = "chats/users.txt"
    if os.path.exists(users_file):
        with open(users_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        updated = False
        with open(users_file, "w", encoding="utf-8") as f:
            for line in lines:
                if line.startswith(f"{old_username}:"):
                    # Сохраняем тот же пароль
                    password_hash = line.split(':', 1)[1]
                    f.write(f"{new_username}:{password_hash}")
                    updated = True
                else:
                    f.write(line)
        
        if not updated:
            return False
    
    # Обновляем профиль
    profiles = load_user_profiles()
    if old_username in profiles:
        profile = profiles.pop(old_username)
        profile["username"] = new_username
        profiles[new_username] = profile
        save_user_profiles(profiles)
    
    # Обновляем историю чатов
    chats = get_chats_list()
    for chat in chats:
        history_file = f"chats/{chat['id']}.txt"
        if os.path.exists(history_file):
            with open(history_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
            
            with open(history_file, "w", encoding="utf-8") as f:
                for line in lines:
                    if line.startswith(f"{old_username}\0"):
                        parts = line.split('\0')
                        parts[0] = new_username
                        f.write('\0'.join(parts))
                    else:
                        f.write(line)
    
    return True

def save_avatar(username: str, avatar_data: bytes) -> str:
    """Сохраняет аватар пользователя"""
    avatars_dir = "static/avatars"
    os.makedirs(avatars_dir, exist_ok=True)
    
    # Генерируем уникальное имя файла
    avatar_filename = f"{username}_{hashlib.md5(avatar_data).hexdigest()[:8]}.png"
    avatar_path = os.path.join(avatars_dir, avatar_filename)
    
    with open(avatar_path, "wb") as f:
        f.write(avatar_data)
    
    # Обновляем профиль
    profiles = load_user_profiles()
    if username in profiles:
        # Удаляем старый аватар если он не дефолтный
        old_avatar = profiles[username].get("avatar", "")
        if old_avatar and not old_avatar.startswith("/static/avatars/default_"):
            old_path = old_avatar.lstrip('/')
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except:
                    pass
        
        profiles[username]["avatar"] = f"/static/avatars/{avatar_filename}"
        save_user_profiles(profiles)
    
    return f"/static/avatars/{avatar_filename}"

# Добавьте эти HTTP маршруты
@app.post("/api/change_username")
async def change_username(request: Request, username: Optional[str] = Cookie(None)):
    """Изменение имени пользователя"""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    data = await request.json()
    new_username = data.get('new_username', '').strip()
    
    if not new_username or len(new_username) < 3 or len(new_username) > 20:
        raise HTTPException(status_code=400, detail="Username must be 3-20 characters")
    
    if update_username(username, new_username):
        response = {"success": True, "new_username": new_username}
        return response
    else:
        raise HTTPException(status_code=400, detail="Failed to update username")

@app.post("/api/upload_avatar")
async def upload_avatar(request: Request, username: Optional[str] = Cookie(None)):
    """Загрузка аватара"""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    form = await request.form()
    file = form.get('avatar')
    
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Проверяем тип файла
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Проверяем размер (макс 2MB)
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 2MB)")
    
    avatar_url = save_avatar(username, content)
    return {"success": True, "avatar_url": avatar_url}

@app.get("/api/user_profile")
async def get_profile(username: Optional[str] = Cookie(None)):
    """Получение профиля пользователя"""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    profile = get_user_profile(username)
    return profile

@app.get("/api/user_avatar/{username}")
async def get_user_avatar(username: str):
    """Получение аватара пользователя"""
    profile = get_user_profile(username)
    avatar_url = profile.get("avatar", "")
    if avatar_url and os.path.exists(avatar_url.lstrip('/')):
        return {"avatar_url": avatar_url}
    return {"avatar_url": f"/static/avatars/default_{hash(username) % 8 + 1}.png"}

# Функции для работы с файлами чатов
def get_chats_list() -> List[dict]:
    """Читает список чатов из list.txt"""
    chats = []
    list_file = "chats/list.txt"

    if not os.path.exists(list_file):
        # Создаем список чатов по умолчанию
        default_chats = [
            "Важное\nВажное: правила и объявления\n",
            "Общение/Оффтоп\nОбщение/Оффтоп: свободное общение\n",
            "Linux/Windows\nLinux/Windows: обсуждение ОС\n",
            "Программирование\nПрограммирование: код и алгоритмы\n"
        ]
        with open(list_file, "w", encoding="utf-8") as f:
            f.writelines(default_chats)

    try:
        with open(list_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
            for i in range(0, len(lines), 2):
                if i + 1 < len(lines):
                    chats.append({
                        "id": i // 2,
                        "name": lines[i].strip(),
                        "description": lines[i+1].strip()
                    })
    except Exception as e:
        print(f"Error reading chats: {e}")

    return chats

def get_last_message(chat_id: int) -> Optional[str]:
    """Получает последнее сообщение из чата"""
    history_file = f"chats/{chat_id}.txt"
    
    if not os.path.exists(history_file):
        return None
    
    try:
        with open(history_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
            if lines:
                last_line = lines[-1].strip()
                if last_line and '\0' in last_line:
                    parts = last_line.split('\0')
                    if len(parts) >= 2:
                        nick = parts[0]
                        message = parts[1]
                        # Обрезаем сообщение до 50 символов
                        if len(message) > 30:
                            message = message[:27] + "..."
                        return f"{nick}: {message}"
    except Exception as e:
        print(f"Error getting last message: {e}")
    
    return None

def get_chat_history(chat_id: int) -> List[dict]:
    """Читает историю сообщений чата"""
    history_file = f"chats/{chat_id}.txt"
    messages = []

    if os.path.exists(history_file):
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and '\0' in line:
                        parts = line.split('\0')
                        if len(parts) >= 2:
                            messages.append({
                                "nick": parts[0],
                                "message": parts[1],
                                "timestamp": parts[2] if len(parts) > 2 else None
                            })
        except Exception as e:
            print(f"Error reading history: {e}")

    return messages

def save_message(chat_id: int, nick: str, message: str):
    """Сохраняет сообщение в историю чата"""
    history_file = f"chats/{chat_id}.txt"
    timestamp = datetime.now().isoformat()

    try:
        with open(history_file, "a", encoding="utf-8") as f:
            f.write(f"{nick}\0{message}\0{timestamp}\n")
    except Exception as e:
        print(f"Error saving message: {e}")

def authenticate_user(username: str, password: str) -> bool:
    """Аутентификация пользователя"""
    users_file = "chats/users.txt"

    # Создаем тестовых пользователей если файла нет
    if not os.path.exists(users_file):
        with open(users_file, "w", encoding="utf-8") as f:
            test_users = [
                ("admin", "123456"),
                ("alice", "alice123"),
                ("bob", "bob123")
            ]
            for user, pwd in test_users:
                pwd_hash = hashlib.sha256(pwd.encode()).hexdigest()
                f.write(f"{user}:{pwd_hash}\n")

    try:
        with open(users_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if ':' in line:
                    user, pwd_hash = line.split(':', 1)
                    if user == username and pwd_hash == hashlib.sha256(password.encode()).hexdigest():
                        return True
    except Exception as e:
        print(f"Error authenticating: {e}")

    return False

def register_user(username: str, password: str) -> bool:
    """Регистрация нового пользователя"""
    users_file = "chats/users.txt"

    # Проверяем существует ли пользователь
    if os.path.exists(users_file):
        try:
            with open(users_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith(f"{username}:"):
                        return False
        except Exception as e:
            print(f"Error checking user: {e}")

    # Добавляем пользователя
    try:
        with open(users_file, "a", encoding="utf-8") as f:
            pwd_hash = hashlib.sha256(password.encode()).hexdigest()
            f.write(f"{username}:{pwd_hash}\n")
        return True
    except Exception as e:
        print(f"Error registering user: {e}")
        return False

# Socket.IO события
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")
    await sio.save_session(sid, {"username": None, "current_chat": None})

@sio.event
async def set_username(sid, data):
    """Устанавливает имя пользователя при подключении"""
    username = data.get('username')
    if not username:
        return

    session = await sio.get_session(sid)
    session['username'] = username
    active_users[sid] = {"username": username, "current_chat": None}

    print(f"User '{username}' connected with sid: {sid}")

    # Отправляем список чатов новому пользователю
    chats = get_chats_list()
    # Добавляем последние сообщения к каждому чату
    for chat in chats:
        chat['last_message'] = get_last_message(chat['id']) or "Нет сообщений"
    
    await sio.emit('chats_list', chats, room=sid)

@sio.event
async def join_chat(sid, data):
    """Присоединение к чату"""
    chat_id = data.get('chat_id')
    if chat_id is None:
        return

    session = await sio.get_session(sid)
    username = session.get('username', 'Anonymous')
    old_chat = session.get('current_chat')

    if old_chat is not None:
        await sio.leave_room(sid, f"chat_{old_chat}")

    session['current_chat'] = chat_id
    await sio.enter_room(sid, f"chat_{chat_id}")

    print(f"User '{username}' joined chat {chat_id}")

    # Отправляем историю сообщений
    history = get_chat_history(chat_id)
    await sio.emit('chat_history', {
        'chat_id': chat_id,
        'messages': history
    }, room=sid)

    # Уведомляем о присоединении
    await sio.emit('user_joined', {
        'username': username,
        'chat_id': chat_id
    }, room=f"chat_{chat_id}", skip_sid=sid)

@sio.event
async def send_message(sid, data):
    """Отправка сообщения в чат"""
    session = await sio.get_session(sid)
    username = session.get('username')
    chat_id = session.get('current_chat')
    message = data.get('message', '').strip()

    if username and chat_id is not None and message:
        # Сохраняем сообщение в файл
        save_message(chat_id, username, message)

        # Отправляем сообщение всем в комнате
        await sio.emit('new_message', {
            'nick': username,
            'message': message,
            'timestamp': datetime.now().isoformat(),
            'chat_id': chat_id
        }, room=f"chat_{chat_id}")

        # Обновляем последнее сообщение для чата
        last_message = f"{username}: {message[:47] + '...' if len(message) > 50 else message}"
        
        # Отправляем обновление последнего сообщения всем клиентам
        await sio.emit('update_last_message', {
            'chat_id': chat_id,
            'last_message': last_message
        })

        print(f"Message from '{username}' in chat {chat_id}: {message[:50]}")

@sio.event
async def disconnect(sid):
    """Обработка отключения пользователя"""
    if sid in active_users:
        username = active_users[sid].get('username', 'Unknown')
        print(f"User '{username}' disconnected")
        del active_users[sid]
    else:
        print(f"Client {sid} disconnected")

# HTTP маршруты
@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Корневой маршрут - перенаправление на страницу чата или аутентификации"""
    return RedirectResponse(url="/auth", status_code=303)

@app.get("/auth", response_class=HTMLResponse)
async def auth_page(request: Request, error: str = None):
    """Страница аутентификации"""
    return templates.TemplateResponse("auth.html", {"request": request, "error": error})

@app.post("/login")
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    """Обработка входа"""
    if authenticate_user(username, password):
        response = RedirectResponse(url="/chat", status_code=303)
        response.set_cookie("username", username)
        return response
    return templates.TemplateResponse("auth.html", {
        "request": request,
        "error": "Неверное имя пользователя или пароль"
    })

@app.post("/register")
async def register(request: Request, username: str = Form(...), password: str = Form(...)):
    """Обработка регистрации"""
    if len(username) < 3:
        return templates.TemplateResponse("auth.html", {
            "request": request,
            "error": "Имя пользователя должно содержать минимум 3 символа"
        })

    if len(password) < 4:
        return templates.TemplateResponse("auth.html", {
            "request": request,
            "error": "Пароль должен содержать минимум 4 символа"
        })

    if register_user(username, password):
        response = RedirectResponse(url="/chat", status_code=303)
        response.set_cookie("username", username)
        return response

    return templates.TemplateResponse("auth.html", {
        "request": request,
        "error": "Пользователь с таким именем уже существует"
    })

@app.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request, username: Optional[str] = Cookie(None)):
    """Страница чата (требует аутентификации)"""
    if not username:
        return RedirectResponse(url="/auth", status_code=303)

    chats = get_chats_list()
    # Добавляем последние сообщения
    for chat in chats:
        chat['last_message'] = get_last_message(chat['id']) or "Нет сообщений"
    
    return templates.TemplateResponse("index.html", {
        "request": request,
        "username": username,
        "chats": chats
    })

@app.get("/logout")
async def logout():
    """Выход из системы"""
    response = RedirectResponse(url="/auth", status_code=303)
    response.delete_cookie("username")
    return response

@app.get("/api/chats")
async def api_get_chats():
    """API для получения списка чатов"""
    chats = get_chats_list()
    for chat in chats:
        chat['last_message'] = get_last_message(chat['id']) or "Нет сообщений"
    return chats

@app.get("/api/chats/{chat_id}/history")
async def api_get_history(chat_id: int):
    """API для получения истории чата"""
    if chat_id < 0:
        raise HTTPException(status_code=400, detail="Invalid chat ID")
    return get_chat_history(chat_id)

if __name__ == "__main__":
    # Создаем тестовые файлы чатов если их нет
    chats = get_chats_list()
    for chat in chats:
        history_file = f"chats/{chat['id']}.txt"
        if not os.path.exists(history_file):
            # Создаем пустой файл истории
            with open(history_file, "w", encoding="utf-8") as f:
                pass

    print("=" * 50)
    print("FreeChat Messenger запущен!")
    print("Доступные чаты:", [chat['name'] for chat in get_chats_list()])
    print("Тестовые аккаунты:")
    print("  - admin / 123456")
    print("  - alice / alice123")
    print("  - bob / bob123")
    print("=" * 50)

    uvicorn.run(
        socket_app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )
