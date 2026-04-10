from fastapi import WebSocket
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        # Закрываем старое соединение если пользователь уже подключён
        # (accept() уже вызван в endpoint до вызова connect)
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].close(code=1000)
            except Exception as e:
                logger.warning("Ошибка закрытия старого соединения пользователя %s: %s", user_id, e)
        self.active_connections[user_id] = websocket
        logger.info("Пользователь %s подключился. Всего онлайн: %s", user_id, len(self.active_connections))

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections and self.active_connections[user_id] is websocket:
            del self.active_connections[user_id]
        logger.info("Пользователь %s отключился. Всего онлайн: %s", user_id, len(self.active_connections))

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)

    async def broadcast(self, message: dict):
        """Отправить сообщение всем подключённым пользователям"""
        dead: list[int] = []
        for user_id, connection in self.active_connections.items():
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning("Ошибка отправки пользователю %s: %s", user_id, e)
                dead.append(user_id)
        for user_id in dead:
            self.active_connections.pop(user_id, None)

    async def send_typing_status(self, sender_id: int, receiver_id: int, is_typing: bool):
        """Отправить статус печатания"""
        if receiver_id in self.active_connections:
            await self.active_connections[receiver_id].send_json({
                "type": "typing",
                "user_id": sender_id,
                "is_typing": is_typing
            })

    def get_online_users(self) -> List[int]:
        return list(self.active_connections.keys())


manager = ConnectionManager()
