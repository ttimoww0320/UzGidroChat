from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Request
import json
import re
import time
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import joinedload
from database import engine, get_db, Base
from models import User, Message, Group
from schemas import (
    UserCreate, UserLogin, UserResponse, Token,
    MessageCreate, MessageResponse, MessageUpdate,
    GroupCreate, GroupResponse, GroupAddMembers
)
from auth import hash_password, verify_password, create_access_token, decode_token, get_current_user_id
from websocket_manager import manager

Base.metadata.create_all(bind=engine)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

_cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost,http://localhost:4200")
CORS_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

MAX_FILE_SIZE = 50 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    'image': {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'},
    'video': {'mp4', 'avi', 'mov', 'mkv', 'webm'},
    'audio': {'mp3', 'wav', 'ogg', 'flac'},
    'document': {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar'},
}
ALL_ALLOWED_EXTENSIONS = {ext for exts in ALLOWED_EXTENSIONS.values() for ext in exts}

app = FastAPI(
    title="UzGidroChat API",
    description="Корпоративный мессенджер для Узбекгидроэнерго",
    version="2.0.0"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    logger.info("%s %s → %s", request.method, request.url.path, response.status_code)
    return response

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# UUID-содержащие имена файлов, которые мы генерируем сами
_UUID_IN_FILENAME = re.compile(
    r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    re.IGNORECASE,
)

# Словарь для rate limiting typing-статусов: user_id -> timestamp последнего события
_typing_last_sent: dict[int, float] = {}


def _safe_upload_filename(stored_path: str | None) -> str | None:
    """Безопасно извлекает имя файла из хранимого пути.
    Возвращает None, если путь подозрителен (нет UUID — значит не наш файл).
    """
    if not stored_path:
        return None
    name = os.path.basename(stored_path)
    if not _UUID_IN_FILENAME.search(name):
        logger.warning("Подозрительный путь к файлу в БД: %s", stored_path)
        return None
    return name


def get_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lstrip('.').lower()
    for file_type, extensions in ALLOWED_EXTENSIONS.items():
        if ext in extensions:
            return file_type
    return 'document'


@app.get("/")
async def root():
    return {"message": "UzGidroChat API работает!"}


# ==================== USERS ====================

@app.post("/register", response_model=UserResponse)
@limiter.limit("5/minute")
async def register(request: Request, user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email уже используется")

    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hash_password(user.password),
        full_name=user.full_name
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        logger.warning("Неудачная попытка входа: пользователь '%s'", user.username)
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    access_token = create_access_token(data={"sub": db_user.username, "user_id": db_user.id})
    return {"access_token": access_token, "token_type": "bearer", "user": db_user}


@app.post("/logout")
async def logout(current_user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user_id).first()
    if user:
        user.is_online = False
        user.last_seen = datetime.now(timezone.utc)
        db.commit()
    return {"message": "Выход выполнен"}


@app.get("/users", response_model=List[UserResponse])
async def get_users(db: Session = Depends(get_db), _: int = Depends(get_current_user_id)):
    return db.query(User).all()


@app.get("/users/online")
async def get_online_users(_: int = Depends(get_current_user_id)):
    return {"online_users": manager.get_online_users()}


@app.post("/users/{user_id}/avatar")
@limiter.limit("5/minute")
async def upload_avatar(
    request: Request,
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Нельзя менять аватар другого пользователя")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    ext = Path(file.filename).suffix.lstrip('.').lower()
    if ext not in ALLOWED_EXTENSIONS['image']:
        raise HTTPException(status_code=400, detail="Только изображения разрешены для аватара")

    unique_filename = f"avatar_{user_id}_{uuid.uuid4()}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    total = 0
    with open(file_path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > 5 * 1024 * 1024:  # 5 MB лимит для аватара
                buffer.close()
                os.remove(file_path)
                raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 5 МБ)")
            buffer.write(chunk)

    if user.avatar_path:
        old_name = _safe_upload_filename(user.avatar_path)
        if old_name:
            old_path = os.path.join(UPLOAD_DIR, old_name)
            if os.path.exists(old_path):
                os.remove(old_path)

    user.avatar_path = f"/uploads/{unique_filename}"
    db.commit()
    db.refresh(user)
    return {"avatar_path": user.avatar_path}


@app.delete("/users/{user_id}/avatar")
async def delete_avatar(
    user_id: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Нельзя удалить аватар другого пользователя")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if user.avatar_path:
        old_name = _safe_upload_filename(user.avatar_path)
        if old_name:
            old_path = os.path.join(UPLOAD_DIR, old_name)
            if os.path.exists(old_path):
                os.remove(old_path)

    user.avatar_path = None
    db.commit()
    return {"message": "Аватарка удалена"}


# ==================== GROUPS ====================

@app.post("/groups", response_model=GroupResponse)
async def create_group(
    group: GroupCreate,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    db_group = Group(name=group.name, description=group.description, creator_id=current_user_id)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)

    creator = db.query(User).filter(User.id == current_user_id).first()
    if creator:
        db_group.members.append(creator)

    for member_id in group.member_ids:
        member = db.query(User).filter(User.id == member_id).first()
        if member and member not in db_group.members:
            db_group.members.append(member)

    db.commit()
    db.refresh(db_group)
    return db_group


@app.get("/groups", response_model=List[GroupResponse])
async def get_groups(db: Session = Depends(get_db), current_user_id: int = Depends(get_current_user_id)):
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user.groups


@app.get("/groups/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if current_user_id not in {m.id for m in group.members}:
        raise HTTPException(status_code=403, detail="Вы не являетесь членом этой группы")
    return group


@app.post("/groups/{group_id}/members")
async def add_members(
    group_id: int,
    data: GroupAddMembers,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if group.creator_id != current_user_id:
        raise HTTPException(status_code=403, detail="Только создатель группы может добавлять участников")

    for uid in data.user_ids:
        member = db.query(User).filter(User.id == uid).first()
        if member and member not in group.members:
            group.members.append(member)

    db.commit()
    return {"message": "Участники добавлены"}


@app.delete("/groups/{group_id}/members/{user_id}")
async def remove_member(
    group_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if group.creator_id != current_user_id and current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Нет доступа")

    user = db.query(User).filter(User.id == user_id).first()
    if user and user in group.members:
        group.members.remove(user)
        db.commit()

    return {"message": "Участник удалён"}


# ==================== MESSAGES ====================

async def _notify_message_update(data: dict, message: Message, db: Session):
    """Отправить обновление сообщения только участникам переписки."""
    if message.receiver_id:
        await manager.send_personal_message(data, message.sender_id)
        await manager.send_personal_message(data, message.receiver_id)
    elif message.group_id:
        group = db.query(Group).options(joinedload(Group.members)).filter(Group.id == message.group_id).first()
        if group:
            for member in group.members:
                await manager.send_personal_message(data, member.id)


@app.post("/messages", response_model=MessageResponse)
async def create_message(
    message: MessageCreate,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    # Проверка доступа к получателю/группе
    if message.group_id:
        group = db.query(Group).filter(Group.id == message.group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Группа не найдена")
        if current_user_id not in {m.id for m in group.members}:
            raise HTTPException(status_code=403, detail="Вы не являетесь членом этой группы")
    elif message.receiver_id:
        receiver = db.query(User).filter(User.id == message.receiver_id).first()
        if not receiver:
            raise HTTPException(status_code=404, detail="Получатель не найден")
    else:
        raise HTTPException(status_code=400, detail="Необходимо указать receiver_id или group_id")

    if message.reply_to_id:
        reply = db.query(Message).filter(Message.id == message.reply_to_id).first()
        if not reply or reply.is_deleted:
            raise HTTPException(status_code=404, detail="Сообщение для ответа не найдено")
        # Проверяем, что пользователь имеет доступ к сообщению, на которое отвечает
        if reply.group_id:
            reply_group = db.query(Group).filter(Group.id == reply.group_id).first()
            if not reply_group or current_user_id not in {m.id for m in reply_group.members}:
                raise HTTPException(status_code=403, detail="Нет доступа к этому сообщению")
        elif reply.receiver_id:
            if current_user_id not in (reply.sender_id, reply.receiver_id):
                raise HTTPException(status_code=403, detail="Нет доступа к этому сообщению")

    db_message = Message(
        content=message.content,
        sender_id=current_user_id,
        receiver_id=message.receiver_id,
        group_id=message.group_id,
        reply_to_id=message.reply_to_id,
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)

    message_data = {
        "type": "new_message",
        "message": {
            "id": db_message.id,
            "content": db_message.content,
            "sender_id": db_message.sender_id,
            "receiver_id": db_message.receiver_id,
            "group_id": db_message.group_id,
            "file_name": db_message.file_name,
            "file_path": db_message.file_path,
            "file_type": db_message.file_type,
            "reply_to_id": db_message.reply_to_id,
            "created_at": db_message.created_at.isoformat(),
        }
    }
    await _notify_message_update(message_data, db_message, db)
    return db_message


@app.post("/messages/upload", response_model=MessageResponse)
@limiter.limit("20/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    receiver_id: Optional[int] = None,
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    if not receiver_id and not group_id:
        raise HTTPException(status_code=400, detail="Необходимо указать receiver_id или group_id")

    # Проверка доступа к получателю/группе
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Группа не найдена")
        if current_user_id not in {m.id for m in group.members}:
            raise HTTPException(status_code=403, detail="Вы не являетесь членом этой группы")
    elif receiver_id:
        receiver = db.query(User).filter(User.id == receiver_id).first()
        if not receiver:
            raise HTTPException(status_code=404, detail="Получатель не найден")

    ext = Path(file.filename).suffix.lstrip('.').lower()
    if ext not in ALL_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Тип файла не разрешён")

    unique_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    total = 0
    with open(file_path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_FILE_SIZE:
                buffer.close()
                os.remove(file_path)
                raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 50 МБ)")
            buffer.write(chunk)

    db_message = Message(
        content=None,
        sender_id=current_user_id,
        receiver_id=receiver_id,
        group_id=group_id,
        file_name=file.filename,
        file_path=f"/uploads/{unique_filename}",
        file_type=get_file_type(file.filename),
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)

    message_data = {
        "type": "new_message",
        "message": {
            "id": db_message.id,
            "content": None,
            "sender_id": db_message.sender_id,
            "receiver_id": db_message.receiver_id,
            "group_id": db_message.group_id,
            "file_name": db_message.file_name,
            "file_path": db_message.file_path,
            "file_type": db_message.file_type,
            "created_at": db_message.created_at.isoformat(),
        }
    }
    await _notify_message_update(message_data, db_message, db)
    return db_message


@app.get("/messages/{user_id}/{other_user_id}", response_model=List[MessageResponse])
async def get_messages(
    user_id: int, other_user_id: int,
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    if current_user_id not in (user_id, other_user_id):
        raise HTTPException(status_code=403, detail="Нет доступа к этой переписке")

    messages = db.query(Message).filter(
        Message.is_deleted == False,  # noqa: E712
        ((Message.sender_id == user_id) & (Message.receiver_id == other_user_id)) |
        ((Message.sender_id == other_user_id) & (Message.receiver_id == user_id))
    ).order_by(Message.created_at).offset(skip).limit(min(limit, 200)).all()
    return messages


@app.get("/messages/group/{group_id}", response_model=List[MessageResponse])
async def get_group_messages(
    group_id: int,
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    member_ids = {m.id for m in group.members}
    if current_user_id not in member_ids:
        raise HTTPException(status_code=403, detail="Вы не являетесь членом этой группы")

    messages = db.query(Message).filter(
        Message.group_id == group_id,
        Message.is_deleted == False,  # noqa: E712
    ).order_by(Message.created_at).offset(skip).limit(min(limit, 200)).all()
    return messages


@app.put("/messages/{message_id}")
async def edit_message(
    message_id: int,
    data: MessageUpdate,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if message.sender_id != current_user_id:
        raise HTTPException(status_code=403, detail="Нельзя редактировать чужое сообщение")

    message.content = data.content
    message.is_edited = True
    message.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(message)

    await _notify_message_update(
        {"type": "message_edited", "message": {"id": message.id, "content": message.content,
                                                "is_edited": True, "edited_at": message.edited_at.isoformat()}},
        message, db
    )
    return message


@app.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if message.sender_id != current_user_id:
        raise HTTPException(status_code=403, detail="Нельзя удалить чужое сообщение")

    message.is_deleted = True
    message.content = None
    db.commit()

    await _notify_message_update(
        {"type": "message_deleted", "message_id": message.id},
        message, db
    )
    return {"message": "Сообщение удалено"}


# ==================== READ RECEIPTS ====================

@app.post("/messages/{user_id}/{other_user_id}/read")
async def mark_messages_read(
    user_id: int,
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Нет доступа")
    db.query(Message).filter(
        Message.is_deleted == False,  # noqa: E712
        Message.is_read == False,  # noqa: E712
        Message.receiver_id == current_user_id,
        Message.sender_id == other_user_id,
    ).update({"is_read": True})
    db.commit()
    return {"message": "Сообщения прочитаны"}


@app.post("/messages/group/{group_id}/read")
async def mark_group_messages_read(
    group_id: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if current_user_id not in {m.id for m in group.members}:
        raise HTTPException(status_code=403, detail="Вы не являетесь членом этой группы")
    db.query(Message).filter(
        Message.group_id == group_id,
        Message.is_deleted == False,  # noqa: E712
        Message.is_read == False,  # noqa: E712
        Message.sender_id != current_user_id,
    ).update({"is_read": True})
    db.commit()
    return {"message": "Сообщения прочитаны"}


# ==================== WEBSOCKET ====================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int, token: str, db: Session = Depends(get_db)):
    # Валидация Origin: если заголовок присутствует — он должен быть в списке разрешённых
    origin = websocket.headers.get("origin")
    if origin and origin not in CORS_ORIGINS:
        await websocket.close(code=4003)
        return

    payload = decode_token(token)
    if payload is None or payload.get("user_id") != user_id:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user_id)

    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.is_online = True
        db.commit()
        await manager.broadcast({"type": "user_online", "user_id": user_id})

    try:
        while True:
            try:
                data = await websocket.receive_json()
            except (ValueError, json.JSONDecodeError):
                continue

            if not isinstance(data, dict):
                continue

            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "typing":
                receiver_id = data.get("receiver_id")
                is_typing = data.get("is_typing", False)
                if not isinstance(receiver_id, int) or not isinstance(is_typing, bool):
                    continue
                # Rate limit: не более 2 typing-событий в секунду на пользователя
                now = time.monotonic()
                if now - _typing_last_sent.get(user_id, 0.0) < 0.5:
                    continue
                _typing_last_sent[user_id] = now
                await manager.send_typing_status(user_id, receiver_id, is_typing)

    except WebSocketDisconnect:
        _typing_last_sent.pop(user_id, None)
        manager.disconnect(websocket, user_id)
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.now(timezone.utc)
            db.commit()
            await manager.broadcast({"type": "user_offline", "user_id": user_id})


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
