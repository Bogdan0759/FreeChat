from fastapi import APIRouter, Request, Form, HTTPException, Depends, Cookie
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from typing import Optional
import os

from util.auth import authenticate_user, register_user
from util.chat_utils import get_chats_list, get_last_message
from util.profile import get_user_profile, update_username, save_avatar

router = APIRouter()
templates = Jinja2Templates(directory="templates")

# HTTP маршруты
@router.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Корневой маршрут - перенаправление на страницу чата или аутентификации"""
    return RedirectResponse(url="/auth", status_code=303)

@router.get("/auth", response_class=HTMLResponse)
async def auth_page(request: Request, error: str = None):
    """Страница аутентификации"""
    return templates.TemplateResponse("auth.html", {"request": request, "error": error})

@router.post("/login")
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

@router.post("/register")
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

@router.get("/chat", response_class=HTMLResponse)
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

@router.get("/logout")
async def logout():
    """Выход из системы"""
    response = RedirectResponse(url="/auth", status_code=303)
    response.delete_cookie("username")
    return response

# API маршруты
@router.get("/api/chats")
async def api_get_chats():
    """API для получения списка чатов"""
    from util.chat_utils import get_chats_list, get_last_message
    chats = get_chats_list()
    for chat in chats:
        chat['last_message'] = get_last_message(chat['id']) or "Нет сообщений"
    return chats

@router.get("/api/chats/{chat_id}/history")
async def api_get_history(chat_id: int):
    """API для получения истории чата"""
    from util.chat_utils import get_chat_history
    if chat_id < 0:
        raise HTTPException(status_code=400, detail="Invalid chat ID")
    return get_chat_history(chat_id)

@router.post("/api/change_username")
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

@router.post("/api/upload_avatar")
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

@router.get("/api/user_profile")
async def get_profile(username: Optional[str] = Cookie(None)):
    """Получение профиля пользователя"""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    profile = get_user_profile(username)
    return profile

@router.get("/api/user_avatar/{username}")
async def get_user_avatar(username: str):
    """Получение аватара пользователя"""
    profile = get_user_profile(username)
    avatar_url = profile.get("avatar", "")
    if avatar_url and os.path.exists(avatar_url.lstrip('/')):
        return {"avatar_url": avatar_url}
    return {"avatar_url": f"/static/avatars/default_{hash(username) % 8 + 1}.png"}
