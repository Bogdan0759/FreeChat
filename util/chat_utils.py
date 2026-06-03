import os
from datetime import datetime
from typing import Dict, List, Optional

# Хранилище активных пользователей
active_users: Dict[str, dict] = {}

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
