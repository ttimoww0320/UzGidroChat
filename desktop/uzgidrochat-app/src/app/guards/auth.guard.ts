import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  // Токен уже загружен в AuthService.init() через APP_INITIALIZER до активации маршрутов.
  // Проверка подлинности и срока действия токена выполняется на сервере при каждом запросе.
  if (!authService.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }

  return true;
};
