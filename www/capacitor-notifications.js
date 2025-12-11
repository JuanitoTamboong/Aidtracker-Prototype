// capacitor-notifications.js - Production ready (no icon.png dependency)

// Create a base64 encoded icon to avoid file loading
const NOTIFICATION_ICON = 'data:image/svg+xml;base64,' + btoa(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill="#4CAF50" stroke="#2E7D32" stroke-width="2"/>
    <path d="M50 30 L50 70 M30 50 L70 50" stroke="white" stroke-width="10" stroke-linecap="round"/>
  </svg>
`);

const EMERGENCY_ICON = 'data:image/svg+xml;base64,' + btoa(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill="#e74c3c" stroke="#c0392b" stroke-width="2"/>
    <text x="50" y="68" text-anchor="middle" fill="white" font-family="Arial" font-size="50" font-weight="bold">!</text>
  </svg>
`);

// ============ NOTIFICATION SYSTEM ============
class NotificationSystem {
    constructor() {
        this.notifications = [];
        this.unreadCount = 0;
        this.initialize();
    }
    
    initialize() {
        console.log('🔔 Production Notification System Initialized');
        this.loadFromStorage();
        this.updateBadge();
        
        // Request browser permission
        if (typeof window !== 'undefined' && "Notification" in window) {
            if (Notification.permission === "default") {
                Notification.requestPermission().then(permission => {
                    console.log('Notification permission:', permission);
                }).catch(console.error);
            }
        }
    }
    
    async showNotification(title, message, options = {}) {
        const notification = {
            id: Date.now(),
            title: title,
            message: message,
            app: options.app || 'AidTracker',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date().toISOString(),
            read: false,
            data: options.data || {},
            icon: options.icon || NOTIFICATION_ICON
        };
        
        // Add to notifications
        this.notifications.unshift(notification);
        if (!notification.read) {
            this.unreadCount++;
        }
        this.saveToStorage();
        this.updateBadge();
        
        // Show browser notification if permitted
        if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "granted") {
            this.showBrowserNotification(notification);
        }
        
        // Show in-app notification
        this.showInAppNotification(notification);
        
        return notification;
    }
    
    showBrowserNotification(notification) {
        try {
            const browserNotification = new Notification(notification.title, {
                body: notification.message,
                icon: notification.icon,
                tag: 'aidtracker-' + notification.id,
                badge: notification.icon
            });
            
            browserNotification.onclick = () => {
                this.handleNotificationClick(notification);
                browserNotification.close();
            };
            
            // Auto close after 8 seconds
            setTimeout(() => browserNotification.close(), 8000);
        } catch (error) {
            console.log('Browser notification failed:', error);
        }
    }
    
    showInAppNotification(notification) {
        // This creates the Android-style notification in the UI
        const notificationEl = document.createElement('div');
        notificationEl.className = 'android-style-notification';
        notificationEl.dataset.id = notification.id;
        
        notificationEl.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="width: 40px; height: 40px; background: #FFD700; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #001f3f; font-weight: bold; font-size: 18px; flex-shrink: 0;">
                    ${notification.app ? notification.app.charAt(0).toUpperCase() : 'A'}
                </div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div style="font-weight: bold; font-size: 16px; color: #FFD700;">${notification.title}</div>
                        <div style="font-size: 12px; color: #aaa;">${notification.time}</div>
                    </div>
                    <div style="color: #eee; font-size: 14px; line-height: 1.4; margin-bottom: 12px;">
                        ${notification.message}
                    </div>
                </div>
            </div>
        `;
        
        let container = document.getElementById('notificationContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificationContainer';
            container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 10px;';
            document.body.appendChild(container);
        }
        
        container.appendChild(notificationEl);
        
        // Auto remove after 10 seconds
        setTimeout(() => {
            if (notificationEl.parentElement) {
                notificationEl.style.animation = 'slideOutRight 0.3s ease forwards';
                setTimeout(() => {
                    if (notificationEl.parentElement) {
                        notificationEl.parentElement.removeChild(notificationEl);
                    }
                }, 300);
            }
        }, 10000);
        
        // Click to dismiss
        notificationEl.onclick = () => {
            this.handleNotificationClick(notification);
            if (notificationEl.parentElement) {
                notificationEl.parentElement.removeChild(notificationEl);
            }
        };
    }
    
    handleNotificationClick(notification) {
        console.log('Notification clicked:', notification);
        
        // Mark as read
        const index = this.notifications.findIndex(n => n.id === notification.id);
        if (index !== -1) {
            this.notifications[index].read = true;
            this.unreadCount = Math.max(0, this.unreadCount - 1);
            this.saveToStorage();
            this.updateBadge();
        }
        
        // Handle navigation based on notification type
        if (notification.data && notification.data.type === 'new_report') {
            // Already on notifications page, just refresh
            if (window.location.pathname.includes('notification.html')) {
                window.location.reload();
            } else {
                window.location.href = 'notification.html';
            }
        }
    }
    
    saveToStorage() {
        try {
            localStorage.setItem('aidtracker_notifications', JSON.stringify(this.notifications.slice(0, 50))); // Keep only 50
        } catch (e) {
            console.error('Failed to save notifications:', e);
        }
    }
    
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('aidtracker_notifications');
            if (stored) {
                this.notifications = JSON.parse(stored);
                this.unreadCount = this.notifications.filter(n => !n.read).length;
            }
        } catch (e) {
            console.error('Failed to load notifications:', e);
        }
    }
    
    updateBadge() {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.style.display = this.unreadCount > 0 ? 'flex' : 'none';
        }
        
        // Update title if needed
        const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = this.unreadCount > 0 ? `(${this.unreadCount}) ${baseTitle}` : baseTitle;
    }
    
    // Show emergency notification for new reports
    async showEmergencyNotification(report) {
        return await this.showNotification(
            '🚨 New Emergency Report',
            `${report.type || 'Incident'} reported by ${report.reporter || 'Anonymous'}`,
            {
                app: 'AidTracker',
                icon: EMERGENCY_ICON,
                data: {
                    type: 'new_report',
                    reportId: report.id,
                    reporter: report.reporter,
                    timestamp: new Date().toISOString()
                }
            }
        );
    }
    
    // Clear all notifications
    clearAll() {
        this.notifications = [];
        this.unreadCount = 0;
        this.saveToStorage();
        this.updateBadge();
    }
    
    // Mark all as read
    markAllAsRead() {
        this.notifications.forEach(n => n.read = true);
        this.unreadCount = 0;
        this.saveToStorage();
        this.updateBadge();
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.notificationManager = new NotificationSystem();
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.notificationManager.initialize();
        });
    } else {
        window.notificationManager.initialize();
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationSystem;
}