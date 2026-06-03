import os
import json
import hashlib
from datetime import datetime
from typing import Dict

user_profiles: Dict[str, dict] = {}

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
            "avatar": f"/static/avatars/default_{abs(hash(username)) % 8 + 1}.png",
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
    from util.chat_utils import get_chats_list
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
    # Создаем директории с абсолютными путями
    avatars_dir = os.path.join(os.getcwd(), "static", "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    
    print(f"Сохранение аватара в: {avatars_dir}")
    
    # Генерируем уникальное имя файла
    avatar_filename = f"{username}_{hashlib.md5(avatar_data).hexdigest()[:8]}.png"
    avatar_path = os.path.join(avatars_dir, avatar_filename)
    
    try:
        with open(avatar_path, "wb") as f:
            f.write(avatar_data)
        print(f"Аватар сохранен: {avatar_path}")
        print(f"Размер файла: {len(avatar_data)} bytes")
    except Exception as e:
        print(f"Ошибка сохранения аватара: {e}")
        raise
    
    # Загружаем текущий профиль
    profiles = load_user_profiles()
    
    if username in profiles:
        # Получаем старый путь к аватару
        old_avatar = profiles[username].get("avatar", "")
        
        # Обновляем профиль с новым аватаром
        profiles[username]["avatar"] = f"/static/avatars/{avatar_filename}"
        save_user_profiles(profiles)
        print(f"Профиль обновлен: {profiles[username]}")
        
        # Удаляем старый аватар, если он существует и отличается от нового
        if old_avatar and old_avatar != f"/static/avatars/{avatar_filename}":
            # Проверяем, не является ли старый аватар дефолтным
            if not old_avatar.startswith("/static/avatars/default_"):
                old_path = os.path.join(os.getcwd(), old_avatar.lstrip('/'))
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                        print(f"Старый аватар удален: {old_path}")
                    except Exception as e:
                        print(f"Ошибка удаления старого аватара: {e}")
    
    return f"/static/avatars/{avatar_filename}"
