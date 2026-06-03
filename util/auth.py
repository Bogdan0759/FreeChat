import hashlib
import os

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
