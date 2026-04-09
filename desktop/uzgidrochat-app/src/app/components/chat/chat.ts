import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { DialogModule } from 'primeng/dialog';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressBarModule } from 'primeng/progressbar';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { AuthService, User } from '../../services/auth';
import { ChatService, Message, Group } from '../../services/chat';

@Component({
  selector: 'app-chat',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    AvatarModule,
    BadgeModule,
    DialogModule,
    CheckboxModule,
    ProgressBarModule,
    ToastModule
  ],
  template: `
    <p-toast position="top-right"></p-toast>
    <div class="chat-container" [class.dark-mode]="darkMode">
      <!-- Боковая панель -->
      <div class="sidebar">
        <div class="sidebar-header">
          <h2>UzGidroChat</h2>
          <div class="header-buttons">
            <p-button [icon]="darkMode ? 'pi pi-sun' : 'pi pi-moon'" severity="secondary" [text]="true" (click)="toggleTheme()" />
            <p-button icon="pi pi-sign-out" severity="secondary" [text]="true" (click)="logout()" />
          </div>
        </div>
        
        <div class="current-user" (click)="showProfileDialog = true" style="cursor: pointer;">
          @if (currentUser?.avatar_path) {
            <p-avatar [image]="getAvatarUrl(currentUser?.avatar_path)" size="large" shape="circle" />
          } @else {
            <p-avatar [label]="currentUser?.full_name?.charAt(0) || 'U'" size="large" shape="circle" />
          }
          <div class="user-info">
            <strong>{{ currentUser?.full_name }}</strong>
            <small>{{ currentUser?.email }}</small>
          </div>
        </div>

        <!-- Личные чаты -->
        <div class="users-list">
          <div class="section-header">
            <h3>Пользователи</h3>
          </div>
          @for (user of users; track user.id) {
            @if (user.id !== currentUser?.id) {
              <div class="user-item" [class.active]="selectedUser?.id === user.id && !selectedGroup" (click)="selectUser(user)">
                <div class="avatar-wrapper">
                  @if (user.avatar_path) {
                    <p-avatar [image]="getAvatarUrl(user.avatar_path)" shape="circle" />
                  } @else {
                    <p-avatar [label]="user.full_name.charAt(0)" shape="circle" />
                  }
                  <span class="status-dot" [class.online]="user.is_online"></span>
                </div>
                <div class="user-item-info">
                  <strong>{{ user.full_name }}</strong>
                  <small>{{ user.is_online ? 'онлайн' : getLastSeen(user.last_seen) }}</small>
                </div>
              </div>
            }
          }
        </div>

        <!-- Групповые чаты -->
        <div class="groups-list">
          <div class="section-header">
            <h3>Группы</h3>
            <p-button icon="pi pi-plus" [rounded]="true" [text]="true" size="small" (click)="showCreateGroupDialog = true" />
          </div>
          @for (group of groups; track group.id) {
            <div class="user-item" [class.active]="selectedGroup?.id === group.id" (click)="selectGroup(group)">
              <p-avatar [label]="group.name.charAt(0)" shape="circle" styleClass="group-avatar" />
              <div class="user-item-info">
                <strong>{{ group.name }}</strong>
                <small>{{ group.members.length }} участников</small>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Область чата -->
      <div class="chat-area">
        @if (selectedUser || selectedGroup) {
          <div class="chat-header">
            <div class="avatar-wrapper">
              @if (selectedUser?.avatar_path) {
                <p-avatar [image]="getAvatarUrl(selectedUser?.avatar_path)" shape="circle" />
              } @else {
                <p-avatar [label]="(selectedGroup?.name || selectedUser?.full_name)?.charAt(0) || '?'" shape="circle" />
              }
              @if (selectedUser) {
                <span class="status-dot" [class.online]="selectedUser.is_online"></span>
              }
            </div>
            <div class="chat-header-info">
              <strong>{{ selectedGroup?.name || selectedUser?.full_name }}</strong>
              <small>{{ selectedGroup ? selectedGroup.members.length + ' участников' : (selectedUser?.is_online ? 'онлайн' : getLastSeen(selectedUser?.last_seen)) }}</small>
            </div>
            @if (selectedGroup) {
              <p-button icon="pi pi-users" [rounded]="true" [text]="true" (click)="showGroupMembersDialog = true" />
            }
          </div>

          @if (typingUser) {
            <div class="typing-indicator">
              <span>{{ typingUser }} печатает</span>
              <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          }

          <div class="messages-area" #messagesArea (click)="hideContextMenu()">
            @for (message of messages; track message.id) {
              <div class="message" 
                   [id]="'message-' + message.id"
                   [class.sent]="message.sender_id === currentUser?.id" 
                   [class.received]="message.sender_id !== currentUser?.id"
                   [class.deleted]="message.is_deleted"
                   (contextmenu)="onRightClick($event, message)">
                @if (selectedGroup && message.sender_id !== currentUser?.id) {
                  <div class="message-sender">{{ getSenderName(message.sender_id) }}</div>
                }

                @if (message.reply_to_id) {
                  <div class="message-reply" (click)="scrollToMessage(message.reply_to_id)">
                    <div class="reply-line"></div>
                    <div class="reply-content">
                      <strong>{{ getReplyMessageSender(message.reply_to_id) }}</strong>
                      <span>{{ getReplyMessageContent(message.reply_to_id) }}</span>
                    </div>
                  </div>
                }
                
                @if (message.file_path && !message.is_deleted) {
                  <div class="message-file">
                    @if (message.file_type === 'image') {
                      <img [src]="getFileUrl(message.file_path)" [alt]="message.file_name" class="message-image" (click)="openImage(message.file_path)" />
                    } @else if (message.file_type === 'audio' || message.file_name?.endsWith('.webm')) {
                      <div class="voice-message">
                        <audio [src]="getFileUrl(message.file_path)" controls></audio>
                      </div>
                    } @else {
                      <div class="file-attachment">
                        <i class="pi pi-file"></i>
                        <a [href]="getFileUrl(message.file_path)" target="_blank">{{ message.file_name }}</a>
                      </div>
                    }
                  </div>
                }
                
                @if (message.is_deleted) {
                  <div class="message-content deleted-text">
                    <i class="pi pi-ban"></i> Сообщение удалено
                  </div>
                } @else if (message.content) {
                  <div class="message-content">
                    {{ message.content }}
                    @if (message.is_edited) {
                      <span class="edited-label">(ред.)</span>
                    }
                  </div>
                }
                
                <div class="message-time">
                  {{ formatTime(message.created_at) }}
                </div>
              </div>
            }
          </div>

          @if (uploading) {
            <div class="upload-progress">
              <p-progressBar mode="indeterminate" [style]="{ height: '4px' }" />
              <span>Загрузка файла...</span>
            </div>
          }

          @if (replyToMessage) {
            <div class="reply-preview">
              <div class="reply-preview-content">
                <strong>{{ getSenderName(replyToMessage.sender_id) }}</strong>
                <span>{{ replyToMessage.content || '📎 Файл' }}</span>
              </div>
              <button class="reply-close" (click)="cancelReply()">
                <i class="pi pi-times"></i>
              </button>
            </div>
          }

          <div class="message-input">
            <input type="file" #fileInput (change)="onFileSelected($event)" style="display: none" />
            <button class="icon-btn" (click)="fileInput.click()" title="Прикрепить файл">
              <i class="pi pi-paperclip"></i>
            </button>
            <input type="text" pInputText [(ngModel)]="newMessage" placeholder="Введите сообщение..." (keyup.enter)="sendMessage()" (input)="onTyping()" class="flex-grow" />
            @if (newMessage.trim()) {
              <button class="icon-btn send-btn" (click)="sendMessage()" title="Отправить">
                <i class="pi pi-send"></i>
              </button>
            } @else {
              <button class="icon-btn" [class.recording]="isRecording" (mousedown)="startRecording()" (mouseup)="stopRecording()" (mouseleave)="stopRecording()" title="Записать голосовое">
                <i class="pi pi-microphone"></i>
              </button>
            }

            @if (isRecording) {
              <div class="recording-indicator">
                <span class="recording-dot"></span>
                <span>{{ formatRecordingTime(recordingTime) }}</span>
              </div>
            }
          </div>
        } @else {
          <div class="no-chat-selected">
            <i class="pi pi-comments" style="font-size: 4rem; color: #ccc;"></i>
            <p>Выберите пользователя или группу для начала общения</p>
          </div>
        }
      </div>
    </div>

    <!-- Контекстное меню -->
    @if (showContextMenu && selectedMessage && !selectedMessage.is_deleted) {
      <div class="context-menu" [style.left.px]="contextMenuX" [style.top.px]="contextMenuY">
        <div class="context-menu-item" (click)="replyTo(selectedMessage)">
          <i class="pi pi-reply"></i> Ответить
        </div>
        @if (selectedMessage.sender_id === currentUser?.id) {
          <div class="context-menu-item" (click)="startEditMessage()">
            <i class="pi pi-pencil"></i> Редактировать
          </div>
          <div class="context-menu-item delete" (click)="deleteMessage()">
            <i class="pi pi-trash"></i> Удалить
          </div>
        }
      </div>
    }

    <!-- Диалог создания группы -->
    <p-dialog header="Создать группу" [(visible)]="showCreateGroupDialog" [modal]="true" [style]="{width: '400px'}">
      <div class="form-group">
        <label>Название группы</label>
        <input type="text" pInputText [(ngModel)]="newGroupName" placeholder="Введите название" class="w-full" />
      </div>
      <div class="form-group">
        <label>Описание</label>
        <input type="text" pInputText [(ngModel)]="newGroupDescription" placeholder="Описание (необязательно)" class="w-full" />
      </div>
      <div class="form-group">
        <label>Участники</label>
        @for (user of users; track user.id) {
          @if (user.id !== currentUser?.id) {
            <div class="checkbox-item">
              <p-checkbox [(ngModel)]="selectedMemberIds" [value]="user.id" [inputId]="'user' + user.id" />
              <label [for]="'user' + user.id">{{ user.full_name }}</label>
            </div>
          }
        }
      </div>
      <div class="dialog-footer">
        <p-button label="Отмена" severity="secondary" (click)="showCreateGroupDialog = false" />
        <p-button label="Создать" (click)="createGroup()" [disabled]="!newGroupName.trim()" />
      </div>
    </p-dialog>

    <!-- Диалог участников группы -->
    <p-dialog header="Участники группы" [(visible)]="showGroupMembersDialog" [modal]="true" [style]="{width: '350px'}">
      @if (selectedGroup) {
        @for (member of selectedGroup.members; track member.id) {
          <div class="member-item">
            <p-avatar [label]="member.full_name.charAt(0)" shape="circle" />
            <span>{{ member.full_name }}</span>
            @if (member.id === selectedGroup.creator_id) {
              <small class="creator-badge">Создатель</small>
            }
          </div>
        }
      }
    </p-dialog>

    <!-- Диалог редактирования сообщения -->
    <p-dialog header="Редактировать сообщение" [(visible)]="showEditDialog" [modal]="true" [style]="{width: '400px'}">
      <div class="form-group">
        <input type="text" pInputText [(ngModel)]="editMessageText" class="w-full" (keyup.enter)="saveEditMessage()" />
      </div>
      <div class="dialog-footer">
        <p-button label="Отмена" severity="secondary" (click)="cancelEditMessage()" />
        <p-button label="Сохранить" (click)="saveEditMessage()" [disabled]="!editMessageText.trim()" />
      </div>
    </p-dialog>

    <!-- Диалог профиля -->
    <p-dialog header="Мой профиль" [(visible)]="showProfileDialog" [modal]="true" [style]="{width: '400px'}">
      <div class="profile-content">
        <div class="profile-avatar">
          @if (currentUser?.avatar_path) {
            <p-avatar [image]="getAvatarUrl(currentUser?.avatar_path)" size="xlarge" shape="circle" />
          } @else {
            <p-avatar [label]="currentUser?.full_name?.charAt(0) || 'U'" size="xlarge" shape="circle" />
          }
        </div>
        <div class="profile-info">
          <h3>{{ currentUser?.full_name }}</h3>
          <p>{{ currentUser?.email }}</p>
        </div>
        <div class="profile-actions">
          <input type="file" #avatarInput (change)="onAvatarSelected($event)" accept="image/*" style="display: none" />
          <p-button label="Загрузить фото" icon="pi pi-upload" (click)="avatarInput.click()" />
          @if (currentUser?.avatar_path) {
            <p-button label="Удалить фото" icon="pi pi-trash" severity="danger" [outlined]="true" (click)="removeAvatar()" />
          }
        </div>
      </div>
    </p-dialog>

    <!-- Диалог просмотра изображения -->
    <p-dialog [(visible)]="showImageDialog" [modal]="true" [style]="{width: '90vw', maxWidth: '800px'}" [dismissableMask]="true">
      <img [src]="selectedImage" style="width: 100%; height: auto;" />
    </p-dialog>
  `,
  styles: [`
    .chat-container {
      display: flex;
      height: 100vh;
      background: #f5f5f5;
    }

    .sidebar {
      width: 300px;
      background: #1e3a5f;
      color: white;
      display: flex;
      flex-direction: column;
    }

    .sidebar-header {
      padding: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .sidebar-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .current-user {
      padding: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(255,255,255,0.1);
    }

    .user-info {
      display: flex;
      flex-direction: column;
    }

    .user-info small {
      opacity: 0.7;
      font-size: 0.75rem;
    }

    .users-list, .groups-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 1rem;
    }

    .groups-list {
      border-top: 1px solid rgba(255,255,255,0.1);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .section-header h3 {
      margin: 0;
      font-size: 0.875rem;
      opacity: 0.7;
      text-transform: uppercase;
    }

    .user-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .user-item:hover {
      background: rgba(255,255,255,0.1);
    }

    .user-item.active {
      background: rgba(255,255,255,0.2);
    }

    .user-item-info {
      display: flex;
      flex-direction: column;
    }

    .user-item-info small {
      opacity: 0.7;
      font-size: 0.75rem;
    }

    .chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .chat-header {
      padding: 1rem;
      background: white;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .chat-header-info {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .chat-header-info small {
      color: #666;
      font-size: 0.75rem;
    }

    .messages-area {
      flex: 1;
      padding: 1rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .message {
      max-width: 70%;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      transition: background 0.3s;
    }

    .message.sent {
      align-self: flex-end;
      background: #1e3a5f;
      color: white;
    }

    .message.received {
      align-self: flex-start;
      background: white;
      color: #333;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    .message.deleted {
      opacity: 0.6;
    }

    .message.highlight {
      animation: highlightPulse 2s ease-out;
    }

    @keyframes highlightPulse {
      0%, 100% { background: inherit; }
      50% { background: #ffeb3b; }
    }

    .message-sender {
      font-size: 0.75rem;
      font-weight: bold;
      color: #1e3a5f;
      margin-bottom: 0.25rem;
    }

    .message-content {
      word-wrap: break-word;
    }

    .deleted-text {
      font-style: italic;
      color: #999;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .edited-label {
      font-size: 0.7rem;
      opacity: 0.7;
      margin-left: 0.25rem;
    }

    .message-time {
      font-size: 0.7rem;
      opacity: 0.7;
      margin-top: 0.25rem;
      text-align: right;
    }

    .message-file {
      margin-bottom: 0.5rem;
    }

    .message-image {
      max-width: 250px;
      max-height: 200px;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .message-image:hover {
      transform: scale(1.02);
    }

    .file-attachment {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: rgba(0,0,0,0.1);
      border-radius: 8px;
    }

    .file-attachment i {
      font-size: 1.5rem;
    }

    .file-attachment a {
      color: inherit;
      text-decoration: none;
    }

    .file-attachment a:hover {
      text-decoration: underline;
    }

    .upload-progress {
      padding: 0.5rem 1rem;
      background: #e3f2fd;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .upload-progress span {
      font-size: 0.875rem;
      color: #1976d2;
    }

    .message-input {
      padding: 1rem;
      background: white;
      display: flex;
      gap: 0.5rem;
      box-shadow: 0 -2px 4px rgba(0,0,0,0.1);
    }

    .message-input input {
      flex: 1;
    }

    .no-chat-selected {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: #999;
    }

    .no-chat-selected p {
      margin-top: 1rem;
    }

    .flex-grow {
      flex-grow: 1;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    .w-full {
      width: 100%;
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .member-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
    }

    .creator-badge {
      margin-left: auto;
      background: #1e3a5f;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
    }

    :host ::ng-deep .group-avatar {
      background: #27ae60 !important;
    }

    .avatar-wrapper {
      position: relative;
      display: inline-block;
    }

    .status-dot {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #888;
      border: 2px solid #1e3a5f;
    }

    .status-dot.online {
      background: #4caf50;
    }

    .chat-header .status-dot {
      border-color: white;
    }

    .icon-btn {
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      background: #e0e0e0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .icon-btn:hover {
      background: #d0d0d0;
    }

    .icon-btn i {
      font-size: 1.2rem;
      color: #1e3a5f;
    }

    .icon-btn.send-btn {
      background: #1e3a5f;
    }

    .icon-btn.send-btn i {
      color: white;
    }

    .icon-btn.send-btn:hover {
      background: #2d5a87;
    }

    .icon-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .context-menu {
      position: fixed;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      min-width: 180px;
      white-space: nowrap;
    }

    .context-menu-item {
      padding: 0.75rem 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: background 0.2s;
      color: #333;
    }

    .context-menu-item:hover {
      background: #f0f0f0;
    }

    .context-menu-item.delete {
      color: #e74c3c;
    }

    .context-menu-item.delete:hover {
      background: #fde8e8;
    }

    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      color: #666;
      font-size: 0.875rem;
      font-style: italic;
    }

    .typing-dots {
      display: flex;
      gap: 3px;
    }

    .typing-dots span {
      width: 6px;
      height: 6px;
      background: #666;
      border-radius: 50%;
      animation: typing 1.4s infinite ease-in-out;
    }

    .typing-dots span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-dots span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typing {
      0%, 60%, 100% {
        transform: translateY(0);
      }
      30% {
        transform: translateY(-4px);
      }
    }

    .icon-btn.recording {
      background: #e74c3c;
      animation: pulse 1s infinite;
    }

    .icon-btn.recording i {
      color: white;
    }

    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.1);
      }
    }

    .recording-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0 0.5rem;
      color: #e74c3c;
      font-size: 0.875rem;
    }

    .recording-dot {
      width: 10px;
      height: 10px;
      background: #e74c3c;
      border-radius: 50%;
      animation: blink 1s infinite;
    }

    @keyframes blink {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.3;
      }
    }

    .voice-message {
      padding: 0.25rem;
    }

    .voice-message audio {
      max-width: 250px;
      height: 40px;
      border-radius: 20px;
    }

    .message.sent .voice-message audio {
      filter: invert(1);
    }

    .header-buttons {
      display: flex;
      gap: 0.25rem;
    }

    .profile-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
    }

    .profile-avatar {
      margin-bottom: 0.5rem;
    }

    .profile-info {
      text-align: center;
    }

    .profile-info h3 {
      margin: 0 0 0.5rem 0;
    }

    .profile-info p {
      margin: 0;
      color: #666;
    }

    .profile-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    /* Reply styles */
    .reply-preview {
      display: flex;
      align-items: center;
      padding: 0.5rem 1rem;
      background: #e3f2fd;
      border-left: 3px solid #1e3a5f;
      margin: 0 1rem;
    }

    .reply-preview-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .reply-preview-content strong {
      font-size: 0.75rem;
      color: #1e3a5f;
    }

    .reply-preview-content span {
      font-size: 0.875rem;
      color: #666;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .reply-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
      color: #666;
    }

    .reply-close:hover {
      color: #333;
    }

    .message-reply {
      display: flex;
      gap: 0.5rem;
      padding: 0.5rem;
      margin-bottom: 0.5rem;
      background: rgba(0,0,0,0.05);
      border-radius: 8px;
      cursor: pointer;
    }

    .message-reply:hover {
      background: rgba(0,0,0,0.1);
    }

    .reply-line {
      width: 3px;
      background: #1e3a5f;
      border-radius: 2px;
    }

    .reply-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      overflow: hidden;
    }

    .reply-content strong {
      font-size: 0.7rem;
      color: #1e3a5f;
    }

    .reply-content span {
      font-size: 0.75rem;
      opacity: 0.8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .message.sent .reply-line {
      background: rgba(255,255,255,0.5);
    }

    .message.sent .reply-content strong {
      color: rgba(255,255,255,0.9);
    }

    /* ===== ТЁМНАЯ ТЕМА ===== */
    .chat-container.dark-mode {
      background: #1a1a1a;
    }

    .chat-container.dark-mode .sidebar {
      background: #0d1b2a;
    }

    .chat-container.dark-mode .current-user {
      background: rgba(255,255,255,0.05);
    }

    .chat-container.dark-mode .chat-area {
      background: #1a1a1a;
    }

    .chat-container.dark-mode .chat-header {
      background: #2d2d2d;
      color: white;
    }

    .chat-container.dark-mode .chat-header-info small {
      color: #aaa;
    }

    .chat-container.dark-mode .messages-area {
      background: #1a1a1a;
    }

    .chat-container.dark-mode .message.sent {
      background: #0d47a1;
      color: white;
    }

    .chat-container.dark-mode .message.received {
      background: #2d2d2d;
      color: white;
    }

    .chat-container.dark-mode .message-input {
      background: #2d2d2d;
    }

    .chat-container.dark-mode .message-input input {
      background: #3d3d3d;
      color: white;
      border-color: #4d4d4d;
    }

    .chat-container.dark-mode .icon-btn {
      background: #3d3d3d;
    }

    .chat-container.dark-mode .icon-btn i {
      color: white;
    }

    .chat-container.dark-mode .icon-btn:hover {
      background: #4d4d4d;
    }

    .chat-container.dark-mode .icon-btn.send-btn {
      background: #0d47a1;
    }

    .chat-container.dark-mode .no-chat-selected {
      color: #666;
    }

    .chat-container.dark-mode .status-dot {
      border-color: #0d1b2a;
    }

    .chat-container.dark-mode .chat-header .status-dot {
      border-color: #2d2d2d;
    }

    .chat-container.dark-mode .deleted-text {
      color: #888;
    }

    .chat-container.dark-mode .file-attachment {
      background: rgba(255,255,255,0.1);
    }

    .chat-container.dark-mode .file-attachment a {
      color: #90caf9;
    }

    .chat-container.dark-mode .typing-indicator {
      color: #aaa;
    }

    .chat-container.dark-mode .typing-dots span {
      background: #aaa;
    }

    .chat-container.dark-mode .reply-preview {
      background: #2d2d2d;
      border-left-color: #90caf9;
    }

    .chat-container.dark-mode .reply-preview-content strong {
      color: #90caf9;
    }

    .chat-container.dark-mode .reply-preview-content span {
      color: #aaa;
    }

    .chat-container.dark-mode .message-reply {
      background: rgba(255,255,255,0.1);
    }

    .chat-container.dark-mode .reply-line {
      background: #90caf9;
    }

    .chat-container.dark-mode .reply-content strong {
      color: #90caf9;
    }
  `]
})
export class ChatComponent implements OnInit, OnDestroy {
  private notificationSound: HTMLAudioElement | null = null;
  @ViewChild('messagesArea') messagesArea!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('avatarInput') avatarInput!: ElementRef;

  currentUser: User | null = null;
  users: User[] = [];
  groups: Group[] = [];
  selectedUser: User | null = null;
  selectedGroup: Group | null = null;
  messages: Message[] = [];
  newMessage = '';
  uploading = false;
  
  // Диалоги
  showCreateGroupDialog = false;
  showGroupMembersDialog = false;
  showImageDialog = false;
  showEditDialog = false;
  showProfileDialog = false;
  selectedImage = '';
  newGroupName = '';
  newGroupDescription = '';
  selectedMemberIds: number[] = [];
  
  // Контекстное меню
  showContextMenu = false;
  contextMenuX = 0;
  contextMenuY = 0;
  selectedMessage: Message | null = null;
  editMessageText = '';
  darkMode = false;
  typingUser: string | null = null;
  private typingTimeout: any = null;

  // Голосовые сообщения
  isRecording = false;
  recordingTime = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingInterval: any = null;

  // Ответ на сообщение
  replyToMessage: Message | null = null;
  
  private subscription: Subscription | null = null;

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private router: Router,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    if ('Notification' in window) {
      Notification.requestPermission();
    }

    this.notificationSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleXFxdH18gYWKjo+QkJCPjImEfnh0cW9ubm9wcnV4fICEh4qMjpCRkZGQj42KhoJ+enZ0cnFwcHFyc3V4e36BhIeKjI6QkZGRkI+NioaDf3t4dnRzcXBwcXJzdXh7foCEh4qMjpCRkZGQj42KhoN/e3h2dHNxcHBxcnN1eHt+gYSHioyOkJGRkZCPjYqGg395dnRzcXBwcXJzdXh7foCDh4mMjpCRkZGQj42KhoN/e3h2dHNxcHBxcnN1eHt+gYSHioyOkJGRkZCPjYqGgn95dnRycHBwcXJzdXh7foGEh4qMjpCRkZGQj42KhoJ/e3h2dHNxcHBxcnN1eHt+gYSHioyOkJGRkI+NioaCf3t4dnRzcXBwcXJzdXh7foGEh4qMjpCRkZCPjYqGgn95dnRycHBwcXJzdXh7foGEh4qMjpCRkZCPjYqGgn95dnRycHBwcXJzdXh7foGEh4qMjpCRkZCPjYqGgn95dnRycHBwcXJzdXh7fg==');
    
    this.currentUser = this.authService.getCurrentUser();
    
    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadTheme();
    this.loadUsers();
    this.loadGroups();
    this.connectWebSocket();
  }

  ngOnDestroy(): void {
    this.chatService.disconnectWebSocket();
    this.subscription?.unsubscribe();
  }

  loadUsers(): void {
    this.chatService.getUsers().subscribe({
      next: (users) => {
        this.users = users;
      }
    });
  }

  loadGroups(): void {
    if (this.currentUser) {
      this.chatService.getGroups(this.currentUser.id).subscribe({
        next: (groups) => {
          this.groups = groups;
        }
      });
    }
  }

  connectWebSocket(): void {
    if (this.currentUser) {
      const token = localStorage.getItem('token') || '';
      this.chatService.connectWebSocket(this.currentUser.id, token);
      
      this.subscription = this.chatService.messages$.subscribe((data) => {
        if (data.type === 'new_message') {
          const msg = data.message;
          
          const isCurrentChat = (this.selectedUser && 
              (msg.sender_id === this.selectedUser.id || msg.receiver_id === this.selectedUser.id)) ||
              (this.selectedGroup && msg.group_id === this.selectedGroup.id);
          
          if (isCurrentChat) {
            this.messages.push(msg);
            this.scrollToBottom();
          }
          
          if (msg.sender_id !== this.currentUser?.id) {
            this.showNotification(msg);
          }
        } else if (data.type === 'typing') {
          if (this.selectedUser && data.user_id === this.selectedUser.id) {
            if (data.is_typing) {
              this.typingUser = this.selectedUser.full_name;
              setTimeout(() => {
                this.typingUser = null;
              }, 3000);
            } else {
              this.typingUser = null;
            }
          }
        } else if (data.type === 'message_edited') {
          const index = this.messages.findIndex(m => m.id === data.message.id);
          if (index !== -1) {
            this.messages[index].content = data.message.content;
            this.messages[index].is_edited = true;
          }
        } else if (data.type === 'message_deleted') {
          const index = this.messages.findIndex(m => m.id === data.message_id);
          if (index !== -1) {
            this.messages[index].is_deleted = true;
            this.messages[index].content = null;
          }
        } else if (data.type === 'user_online') {
          const user = this.users.find(u => u.id === data.user_id);
          if (user) {
            user.is_online = true;
          }
          if (this.selectedUser && this.selectedUser.id === data.user_id) {
            this.selectedUser.is_online = true;
          }
        } else if (data.type === 'user_offline') {
          const user = this.users.find(u => u.id === data.user_id);
          if (user) {
            user.is_online = false;
            user.last_seen = new Date().toISOString();
          }
          if (this.selectedUser && this.selectedUser.id === data.user_id) {
            this.selectedUser.is_online = false;
            this.selectedUser.last_seen = new Date().toISOString();
          }
        }
      });
    }
  }

  selectUser(user: User): void {
    this.selectedUser = user;
    this.selectedGroup = null;
    this.replyToMessage = null;
    this.loadMessages();
  }

  selectGroup(group: Group): void {
    this.selectedGroup = group;
    this.selectedUser = null;
    this.replyToMessage = null;
    this.loadGroupMessages();
  }

  loadMessages(): void {
    if (this.currentUser && this.selectedUser) {
      const userId = this.currentUser.id;
      const otherId = this.selectedUser.id;
      this.chatService.getMessages(userId, otherId).subscribe({
        next: (messages) => {
          this.messages = messages;
          this.scrollToBottom();
          this.chatService.markMessagesRead(userId, otherId).subscribe();
        }
      });
    }
  }

  loadGroupMessages(): void {
    if (this.selectedGroup) {
      const groupId = this.selectedGroup.id;
      this.chatService.getGroupMessages(groupId).subscribe({
        next: (messages) => {
          this.messages = messages;
          this.scrollToBottom();
          this.chatService.markGroupMessagesRead(groupId).subscribe();
        }
      });
    }
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.currentUser) {
      return;
    }

    const replyId = this.replyToMessage?.id || null;

    if (this.selectedUser) {
      this.chatService.sendMessage(this.currentUser.id, this.selectedUser.id, this.newMessage, null, replyId).subscribe({
        next: (message) => {
          this.messages.push(message);
          this.newMessage = '';
          this.replyToMessage = null;
          this.scrollToBottom();
        }
      });
    } else if (this.selectedGroup) {
      this.chatService.sendMessage(this.currentUser.id, null, this.newMessage, this.selectedGroup.id, replyId).subscribe({
        next: (message) => {
          this.messages.push(message);
          this.newMessage = '';
          this.replyToMessage = null;
          this.scrollToBottom();
        }
      });
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file || !this.currentUser) return;

    this.uploading = true;

    const receiverId = this.selectedUser?.id || null;
    const groupId = this.selectedGroup?.id || null;

    this.chatService.uploadFile(file, this.currentUser.id, receiverId, groupId).subscribe({
      next: (response) => {
        const message: Message = {
          id: response.id,
          content: null,
          sender_id: this.currentUser!.id,
          receiver_id: receiverId,
          group_id: groupId,
          is_read: false,
          is_edited: false,
          is_deleted: false,
          created_at: response.created_at,
          edited_at: null,
          file_name: response.file_name,
          file_path: response.file_path,
          file_type: response.file_type,
          reply_to_id: null
        };
        this.messages.push(message);
        this.uploading = false;
        this.scrollToBottom();
        
        if (this.fileInput) {
          this.fileInput.nativeElement.value = '';
        }
      },
      error: (err) => {
        console.error('Ошибка загрузки:', err);
        this.uploading = false;
      }
    });
  }

  getFileUrl(filePath: string): string {
    return `${this.chatService.apiUrl}${filePath}`;
  }

  getAvatarUrl(avatarPath: string | null | undefined): string {
    if (!avatarPath) return '';
    return `${this.chatService.apiUrl}${avatarPath}`;
  }

  openImage(filePath: string): void {
    this.selectedImage = this.getFileUrl(filePath);
    this.showImageDialog = true;
  }

  createGroup(): void {
    if (!this.newGroupName.trim() || !this.currentUser) {
      return;
    }

    this.chatService.createGroup(
      this.currentUser.id,
      this.newGroupName,
      this.newGroupDescription,
      this.selectedMemberIds
    ).subscribe({
      next: (group) => {
        this.groups.push(group);
        this.showCreateGroupDialog = false;
        this.newGroupName = '';
        this.newGroupDescription = '';
        this.selectedMemberIds = [];
        this.selectGroup(group);
      }
    });
  }

  // Контекстное меню
  onRightClick(event: MouseEvent, message: Message): void {
    event.preventDefault();
    this.selectedMessage = message;
    
    const menuWidth = 180;
    const menuHeight = 120;
    
    let x = event.clientX;
    let y = event.clientY;
    
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }
    
    this.contextMenuX = x;
    this.contextMenuY = y;
    this.showContextMenu = true;
  }

  hideContextMenu(): void {
    this.showContextMenu = false;
    this.selectedMessage = null;
  }

  startEditMessage(): void {
    if (this.selectedMessage) {
      this.editMessageText = this.selectedMessage.content || '';
      this.showEditDialog = true;
      this.showContextMenu = false;
    }
  }

  cancelEditMessage(): void {
    this.showEditDialog = false;
    this.editMessageText = '';
  }

  saveEditMessage(): void {
    if (!this.selectedMessage || !this.editMessageText.trim() || !this.currentUser) {
      return;
    }

    this.chatService.editMessage(this.selectedMessage.id, this.currentUser.id, this.editMessageText).subscribe({
      next: (updatedMessage) => {
        const index = this.messages.findIndex(m => m.id === updatedMessage.id);
        if (index !== -1) {
          this.messages[index].content = updatedMessage.content;
          this.messages[index].is_edited = true;
        }
        this.cancelEditMessage();
        this.selectedMessage = null;
      },
      error: (err) => {
        console.error('Ошибка редактирования:', err);
      }
    });
  }

  deleteMessage(): void {
    if (!this.selectedMessage || !this.currentUser) {
      return;
    }

    const messageId = this.selectedMessage.id;
    
    this.chatService.deleteMessage(messageId, this.currentUser.id).subscribe({
      next: () => {
        const index = this.messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
          this.messages[index].is_deleted = true;
          this.messages[index].content = null;
        }
        this.hideContextMenu();
      },
      error: (err) => {
        console.error('Ошибка удаления:', err);
      }
    });
  }

  // Аватарка
  onAvatarSelected(event: any): void {
    const file = event.target.files[0];
    if (!file || !this.currentUser) return;

    this.chatService.uploadAvatar(this.currentUser.id, file).subscribe({
      next: (response) => {
        if (this.currentUser) {
          this.currentUser.avatar_path = response.avatar_path;
          localStorage.setItem('user', JSON.stringify(this.currentUser));
        }
        this.messageService.add({
          severity: 'success',
          summary: 'Успешно',
          detail: 'Аватарка обновлена',
          life: 3000
        });
      },
      error: (err) => {
        console.error('Ошибка загрузки аватарки:', err);
      }
    });
  }

  removeAvatar(): void {
    if (!this.currentUser) return;

    this.chatService.deleteAvatar(this.currentUser.id).subscribe({
      next: () => {
        if (this.currentUser) {
          this.currentUser.avatar_path = null;
          localStorage.setItem('user', JSON.stringify(this.currentUser));
        }
        this.messageService.add({
          severity: 'success',
          summary: 'Успешно',
          detail: 'Аватарка удалена',
          life: 3000
        });
      },
      error: (err) => {
        console.error('Ошибка удаления аватарки:', err);
      }
    });
  }

  getSenderName(senderId: number): string {
    const user = this.users.find(u => u.id === senderId);
    return user?.full_name || 'Неизвестный';
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  getLastSeen(lastSeen: string | null | undefined): string {
    if (!lastSeen) {
      return 'был(а) недавно';
    }
    
    const date = new Date(lastSeen);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) {
      return 'был(а) только что';
    } else if (minutes < 60) {
      return `был(а) ${minutes} мин. назад`;
    } else if (hours < 24) {
      return `был(а) ${hours} ч. назад`;
    } else {
      return `был(а) ${days} дн. назад`;
    }
  }

  scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesArea) {
        this.messagesArea.nativeElement.scrollTop = this.messagesArea.nativeElement.scrollHeight;
      }
    }, 100);
  }

  showNotification(message: any): void {
    if (this.notificationSound) {
      this.notificationSound.play().catch(() => {});
    }
    
    const senderName = this.getSenderName(message.sender_id);
    const messageText = message.content || '📎 Файл';
    
    this.messageService.add({
      severity: 'info',
      summary: senderName,
      detail: messageText,
      life: 5000,
      icon: 'pi pi-envelope'
    });
    
    document.title = `💬 Новое сообщение - UzGidroChat`;
    
    setTimeout(() => {
      document.title = 'UzGidroChat';
    }, 3000);
  }

  // Голосовые сообщения
  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.sendVoiceMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingTime = 0;
      
      this.recordingInterval = setInterval(() => {
        this.recordingTime++;
      }, 1000);
      
    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
      this.messageService.add({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Нет доступа к микрофону',
        life: 3000
      });
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }
    }
  }

  sendVoiceMessage(audioBlob: Blob): void {
    if (!this.currentUser) return;
    
    const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
    
    const receiverId = this.selectedUser?.id || null;
    const groupId = this.selectedGroup?.id || null;
    
    this.chatService.uploadFile(file, this.currentUser.id, receiverId, groupId).subscribe({
      next: (response) => {
        const message: Message = {
          id: response.id,
          content: null,
          sender_id: this.currentUser!.id,
          receiver_id: receiverId,
          group_id: groupId,
          is_read: false,
          is_edited: false,
          is_deleted: false,
          created_at: response.created_at,
          edited_at: null,
          file_name: response.file_name,
          file_path: response.file_path,
          file_type: response.file_type,
          reply_to_id: null
        };
        this.messages.push(message);
        this.scrollToBottom();
      },
      error: (err) => {
        console.error('Ошибка отправки голосового:', err);
      }
    });
  }

  formatRecordingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Ответ на сообщение
  replyTo(message: Message): void {
    this.replyToMessage = message;
    this.hideContextMenu();
  }

  cancelReply(): void {
    this.replyToMessage = null;
  }

  getReplyMessageSender(replyToId: number): string {
    const message = this.messages.find(m => m.id === replyToId);
    if (message) {
      return this.getSenderName(message.sender_id);
    }
    return 'Неизвестный';
  }

  getReplyMessageContent(replyToId: number): string {
    const message = this.messages.find(m => m.id === replyToId);
    if (message) {
      if (message.is_deleted) return 'Сообщение удалено';
      return message.content || '📎 Файл';
    }
    return 'Сообщение не найдено';
  }

  scrollToMessage(messageId: number): void {
    const element = document.getElementById('message-' + messageId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight');
      setTimeout(() => {
        element.classList.remove('highlight');
      }, 2000);
    }
  }

  onTyping(): void {
    if (this.selectedUser && this.currentUser) {
      this.chatService.sendTypingStatus(this.selectedUser.id, true);
      
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }
      
      this.typingTimeout = setTimeout(() => {
        if (this.selectedUser) {
          this.chatService.sendTypingStatus(this.selectedUser.id, false);
        }
      }, 2000);
    }
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', this.darkMode.toString());
  }

  loadTheme(): void {
    const saved = localStorage.getItem('darkMode');
    this.darkMode = saved === 'true';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
