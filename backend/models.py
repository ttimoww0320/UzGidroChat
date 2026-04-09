from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, Table
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


def _utcnow():
    return datetime.now(timezone.utc)

# Таблица связи пользователей и групп
group_members = Table(
    'group_members',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('group_id', Integer, ForeignKey('groups.id'), primary_key=True)
)


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(100), unique=True, index=True)
    hashed_password = Column(String(255))
    full_name = Column(String(100))
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, nullable=True)
    avatar_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    
    groups = relationship("Group", secondary=group_members, back_populates="members")


class Group(Base):
    __tablename__ = "groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    description = Column(String(255), nullable=True)
    creator_id = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=_utcnow)
    
    members = relationship("User", secondary=group_members, back_populates="groups")
    creator = relationship("User", foreign_keys=[creator_id])


class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=True)
    sender_id = Column(Integer, ForeignKey('users.id'))
    receiver_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    group_id = Column(Integer, ForeignKey('groups.id'), nullable=True)
    is_read = Column(Boolean, default=False)
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_utcnow)
    edited_at = Column(DateTime, nullable=True)
    
    # Поля для файлов
    file_name = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    file_type = Column(String(50), nullable=True)
    
    # Ответ на сообщение
    reply_to_id = Column(Integer, ForeignKey('messages.id'), nullable=True)
    
    sender = relationship("User", foreign_keys=[sender_id])
    group = relationship("Group")
    reply_to = relationship("Message", remote_side=[id], foreign_keys=[reply_to_id])