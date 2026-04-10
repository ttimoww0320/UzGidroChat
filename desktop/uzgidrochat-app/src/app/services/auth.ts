import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      backendHost: string;
      secureSave: (key: string, value: string) => Promise<boolean>;
      secureGet: (key: string) => Promise<string | null>;
      secureRemove: (key: string) => Promise<void>;
    };
  }
}

const BACKEND_HOST = window.electronAPI?.backendHost ?? '';
const STORAGE_KEY_TOKEN = 'auth_token';
const STORAGE_KEY_USER = 'auth_user';

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

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  // In-memory кэш токена — единственный синхронный источник правды
  private _cachedToken: string | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Инициализация: загружает токен и пользователя из защищённого хранилища.
   * Вызывается через APP_INITIALIZER до активации маршрутов.
   */
  async init(): Promise<void> {
    if (window.electronAPI) {
      // Electron: читаем из safeStorage (зашифровано ОС)
      this._cachedToken = await window.electronAPI.secureGet(STORAGE_KEY_TOKEN);
      const userData = await window.electronAPI.secureGet(STORAGE_KEY_USER);
      if (userData) {
        try { this.currentUserSubject.next(JSON.parse(userData)); } catch { /* ignore */ }
      }
    } else {
      // Браузер: читаем из localStorage
      this._cachedToken = localStorage.getItem('token');
      try {
        const savedUser = localStorage.getItem('user');
        if (savedUser) this.currentUserSubject.next(JSON.parse(savedUser));
      } catch {
        localStorage.clear();
      }
    }
  }

  /** Синхронный доступ к токену для interceptor и WebSocket */
  getToken(): string | null {
    return this._cachedToken;
  }

  register(username: string, email: string, password: string, fullName: string): Observable<User> {
    return this.http.post<User>(`${BACKEND_HOST}/api/register`, {
      username,
      email,
      password,
      full_name: fullName
    });
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${BACKEND_HOST}/api/login`, { username, password }).pipe(
      tap(async response => {
        this._cachedToken = response.access_token;
        if (window.electronAPI) {
          await window.electronAPI.secureSave(STORAGE_KEY_TOKEN, response.access_token);
          await window.electronAPI.secureSave(STORAGE_KEY_USER, JSON.stringify(response.user));
        } else {
          localStorage.setItem('token', response.access_token);
          localStorage.setItem('user', JSON.stringify(response.user));
        }
        this.currentUserSubject.next(response.user);
      })
    );
  }

  logout(): void {
    this._cachedToken = null;
    if (window.electronAPI) {
      window.electronAPI.secureRemove(STORAGE_KEY_TOKEN);
      window.electronAPI.secureRemove(STORAGE_KEY_USER);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    this.currentUserSubject.next(null);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this._cachedToken;
  }
}
