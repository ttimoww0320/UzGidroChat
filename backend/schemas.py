from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
import re


# --- User схемы ---
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=100)

    @field_validator('password')
    @classmethod
    def password_must_be_complex(cls, v: str) -> str:
        errors = []
        if not re.search(r'[A-Z]', v):
            errors.append('заглавную букву')
        if not re.search(r'[a-z]', v):
            errors.append('строчную букву')
        if not re.search(r'\d', v):
            errors.append('цифру')
        if errors:
            raise ValueError(f'Пароль должен содержать: {", ".join(errors)}')
        return v


class UserLogin(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    is_active: bool
    is_online: bool = False
    last_seen: Optional[datetime] = None
    avatar_path: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# --- Group схемы ---
class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    member_ids: List[int] = []


class GroupResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    creator_id: int
    created_at: datetime
    members: List[UserResponse] = []

    class Config:
        from_attributes = True


class GroupAddMembers(BaseModel):
    user_ids: List[int]


# --- Message схемы ---
class MessageCreate(BaseModel):
    content: Optional[str] = Field(None, max_length=10000)
    receiver_id: Optional[int] = None
    group_id: Optional[int] = None
    reply_to_id: Optional[int] = None


class MessageResponse(BaseModel):
    id: int
    content: Optional[str] = None
    sender_id: int
    receiver_id: Optional[int] = None
    group_id: Optional[int] = None
    is_read: bool
    is_edited: bool
    is_deleted: bool
    created_at: datetime
    edited_at: Optional[datetime] = None
    file_name: Optional[str] = None
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    reply_to_id: Optional[int] = None
    reply_to: Optional['MessageResponse'] = None

    class Config:
        from_attributes = True


class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
