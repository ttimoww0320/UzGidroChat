import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';


// В Electron backendHost приходит из preload, в браузере nginx проксирует относительные URL
const BACKEND_HOST: string = (window as any).electronAPI?.backendHost ?? '';
const isElectron = !!(window as any).electronAPI?.isElectron;
const API_URL = BACKEND_HOST + '/api';
const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = isElectron
  ? BACKEND_HOST.replace(/^http/, 'ws')
  : `${wsScheme}//${window.location.host}`;

export interface Message {
  id: number;
  content: string | null;
  sender_id: number;
  receiver_id: number | null;
  group_id: number | null;
  is_read: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
  reply_to_id: number | null;
  reply_to?: Message | null;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_online: boolean;
  last_seen: string | null;
  avatar_path: string | null;
  created_at: string;
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  creator_id: number;
  created_at: string;
  members: User[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private socket: WebSocket | null = null;
  private messagesSubject = new Subject<any>();
  public messages$ = this.messagesSubject.asObservable();
  public apiUrl = API_URL;

  constructor(private http: HttpClient) {}

  connectWebSocket(userId: number, token: string): void {
    this.socket = new WebSocket(`${WS_URL}/ws/${userId}?token=${encodeURIComponent(token)}`);

    this.socket.onopen = () => {
      console.log('WebSocket подключён');
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.messagesSubject.next(data);
    };

    this.socket.onerror = (event) => {
      console.error('WebSocket ошибка:', event);
    };

    this.socket.onclose = () => {
      console.log('WebSocket отключён');
    };
  }

sendTypingStatus(receiverId: number, isTyping: boolean): void {
  if (this.socket && this.socket.readyState === WebSocket.OPEN) {
    this.socket.send(JSON.stringify({
      type: 'typing',
      receiver_id: receiverId,
      is_typing: isTyping
    }));
  }
}

  disconnectWebSocket(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  // Users
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${API_URL}/users`);
  }

  // Personal messages
  getMessages(userId: number, otherUserId: number): Observable<Message[]> {
    return this.http.get<Message[]>(`${API_URL}/messages/${userId}/${otherUserId}`);
  }

  sendMessage(_senderId: number, receiverId: number | null, content: string, groupId: number | null, replyToId: number | null = null): Observable<Message> {
    return this.http.post<Message>(`${API_URL}/messages`, {
      receiver_id: receiverId,
      content: content,
      group_id: groupId,
      reply_to_id: replyToId
    });
  }

  // Upload file
  uploadFile(file: File, _userId: number, receiverId: number | null, groupId: number | null): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);

    const params: string[] = [];
    if (receiverId) params.push(`receiver_id=${receiverId}`);
    if (groupId) params.push(`group_id=${groupId}`);
    const query = params.length ? `?${params.join('&')}` : '';

    return this.http.post(`${API_URL}/messages/upload${query}`, formData);
  }

  markMessagesRead(userId: number, otherUserId: number): Observable<any> {
    return this.http.post(`${API_URL}/messages/${userId}/${otherUserId}/read`, {});
  }

  markGroupMessagesRead(groupId: number): Observable<any> {
    return this.http.post(`${API_URL}/messages/group/${groupId}/read`, {});
  }

  // Groups
  getGroups(_userId: number): Observable<Group[]> {
    return this.http.get<Group[]>(`${API_URL}/groups`);
  }

  createGroup(_creatorId: number, name: string, description: string, memberIds: number[]): Observable<Group> {
    return this.http.post<Group>(`${API_URL}/groups`, {
      name,
      description,
      member_ids: memberIds
    });
  }

  getGroupMessages(groupId: number): Observable<Message[]> {
    return this.http.get<Message[]>(`${API_URL}/messages/group/${groupId}`);
  }
    // Edit message
  editMessage(messageId: number, _userId: number, content: string): Observable<Message> {
    return this.http.put<Message>(`${API_URL}/messages/${messageId}`, { content });
  }

  // Delete message
  deleteMessage(messageId: number, _userId: number): Observable<any> {
    return this.http.delete(`${API_URL}/messages/${messageId}`);
  }
// Avatar
uploadAvatar(userId: number, file: File): Observable<any> {
  const formData = new FormData();
  formData.append('file', file);
  return this.http.post(`${API_URL}/users/${userId}/avatar`, formData);
}

deleteAvatar(userId: number): Observable<any> {
  return this.http.delete(`${API_URL}/users/${userId}/avatar`);
}

  addGroupMembers(groupId: number, userIds: number[]): Observable<any> {
    return this.http.post(`${API_URL}/groups/${groupId}/members`, {
      user_ids: userIds
    });
  }

  removeGroupMember(groupId: number, userId: number): Observable<any> {
    return this.http.delete(`${API_URL}/groups/${groupId}/members/${userId}`);
  }
}