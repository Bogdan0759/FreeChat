import socketio
from datetime import datetime
from util.chat_utils import get_chats_list, get_last_message, get_chat_history, save_message, active_users

sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    async_mode='asgi',
    logger=False,
    engineio_logger=False
)

def setup_socket_events(sio_instance):
    """Настройка всех Socket.IO событий"""
    
    @sio_instance.event
    async def connect(sid, environ):
        print(f"Client connected: {sid}")
        await sio_instance.save_session(sid, {"username": None, "current_chat": None})

    @sio_instance.event
    async def set_username(sid, data):
        """Устанавливает имя пользователя при подключении"""
        username = data.get('username')
        if not username:
            return

        session = await sio_instance.get_session(sid)
        session['username'] = username
        active_users[sid] = {"username": username, "current_chat": None}

        print(f"User '{username}' connected with sid: {sid}")

        # Отправляем список чатов новому пользователю
        chats = get_chats_list()
        # Добавляем последние сообщения к каждому чату
        for chat in chats:
            chat['last_message'] = get_last_message(chat['id']) or "Нет сообщений"
        
        await sio_instance.emit('chats_list', chats, room=sid)

    @sio_instance.event
    async def join_chat(sid, data):
        """Присоединение к чату"""
        chat_id = data.get('chat_id')
        if chat_id is None:
            return

        session = await sio_instance.get_session(sid)
        username = session.get('username', 'Anonymous')
        old_chat = session.get('current_chat')

        if old_chat is not None:
            await sio_instance.leave_room(sid, f"chat_{old_chat}")

        session['current_chat'] = chat_id
        await sio_instance.enter_room(sid, f"chat_{chat_id}")

        print(f"User '{username}' joined chat {chat_id}")

        # Отправляем историю сообщений
        history = get_chat_history(chat_id)
        await sio_instance.emit('chat_history', {
            'chat_id': chat_id,
            'messages': history
        }, room=sid)

        # Уведомляем о присоединении
        await sio_instance.emit('user_joined', {
            'username': username,
            'chat_id': chat_id
        }, room=f"chat_{chat_id}", skip_sid=sid)

    @sio_instance.event
    async def send_message(sid, data):
        """Отправка сообщения в чат"""
        session = await sio_instance.get_session(sid)
        username = session.get('username')
        chat_id = session.get('current_chat')
        message = data.get('message', '').strip()

        if username and chat_id is not None and message:
            # Сохраняем сообщение в файл
            save_message(chat_id, username, message)

            # Отправляем сообщение всем в комнате
            await sio_instance.emit('new_message', {
                'nick': username,
                'message': message,
                'timestamp': datetime.now().isoformat(),
                'chat_id': chat_id
            }, room=f"chat_{chat_id}")

            # Обновляем последнее сообщение для чата
            last_message = f"{username}: {message[:47] + '...' if len(message) > 50 else message}"
            
            # Отправляем обновление последнего сообщения всем клиентам
            await sio_instance.emit('update_last_message', {
                'chat_id': chat_id,
                'last_message': last_message
            })

            print(f"Message from '{username}' in chat {chat_id}: {message[:50]}")

    @sio_instance.event
    async def disconnect(sid):
        """Обработка отключения пользователя"""
        if sid in active_users:
            username = active_users[sid].get('username', 'Unknown')
            print(f"User '{username}' disconnected")
            del active_users[sid]
        else:
            print(f"Client {sid} disconnected")
