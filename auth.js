/**
 * Auth System v3.1.4 - Encrypted
 */

(function(global){
    'use strict';
    
    const AUTH_VERSION = '3.1.4';
    const SESSION_KEY = 'x_sys_auth_v3';
    const TOKEN_KEY = 'x_tk_enc';
    const IV_KEY = 'x_iv_data';
    
    // XOR Encryption System
    class XorCipher {
        constructor(key) {
            this.key = key || 'X0R_S3CR3T_2024';
        }
        
        encrypt(text) {
            let result = '';
            for (let i = 0; i < text.length; i++) {
                const charCode = text.charCodeAt(i);
                const keyChar = this.key.charCodeAt(i % this.key.length);
                result += String.fromCharCode(charCode ^ keyChar);
            }
            return btoa(result);
        }
        
        decrypt(encoded) {
            try {
                const decoded = atob(encoded);
                let result = '';
                for (let i = 0; i < decoded.length; i++) {
                    const charCode = decoded.charCodeAt(i);
                    const keyChar = this.key.charCodeAt(i % this.key.length);
                    result += String.fromCharCode(charCode ^ keyChar);
                }
                return result;
            } catch (e) {
                return null;
            }
        }
    }
    
    // Session Manager
    class SessionManager {
        constructor() {
            this.cipher = new XorCipher();
            this.session = null;
            this.listeners = new Map();
        }
        
        init() {
            this.loadSession();
            this.startAutoRefresh();
            this.setupEventListeners();
        }
        
        loadSession() {
            try {
                const stored = localStorage.getItem(SESSION_KEY);
                if (stored) {
                    const decoded = this.cipher.decrypt(stored);
                    if (decoded) {
                        this.session = JSON.parse(decoded);
                        this.validateSession();
                    }
                }
            } catch (e) {
                this.clearSession();
            }
        }
        
        saveSession(data) {
            const sessionData = {
                ...data,
                timestamp: Date.now(),
                expiry: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
                version: AUTH_VERSION,
                id: this.generateId()
            };
            
            this.session = sessionData;
            const encrypted = this.cipher.encrypt(JSON.stringify(sessionData));
            localStorage.setItem(SESSION_KEY, encrypted);
            
            this.dispatchEvent('session_update', sessionData);
            return sessionData;
        }
        
        clearSession() {
            this.session = null;
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(IV_KEY);
            this.dispatchEvent('session_end');
        }
        
        validateSession() {
            if (!this.session || Date.now() > this.session.expiry) {
                this.clearSession();
                return false;
            }
            
            // Validate structure
            const required = ['timestamp', 'expiry', 'version'];
            if (!required.every(key => key in this.session)) {
                this.clearSession();
                return false;
            }
            
            return true;
        }
        
        generateId() {
            return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        startAutoRefresh() {
            setInterval(() => {
                if (this.session) {
                    this.refreshSession();
                }
            }, 5 * 60 * 1000); // Every 5 minutes
        }
        
        refreshSession() {
            if (this.validateSession()) {
                this.session.expiry = Date.now() + (24 * 60 * 60 * 1000);
                this.saveSession(this.session);
            }
        }
        
        setupEventListeners() {
            // Detect tab/window close
            window.addEventListener('beforeunload', () => {
                if (this.session) {
                    this.session.lastActive = Date.now();
                    this.saveSession(this.session);
                }
            });
            
            // Visibility change
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.session) {
                    this.refreshSession();
                }
            });
        }
        
        on(event, callback) {
            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Set());
            }
            this.listeners.get(event).add(callback);
        }
        
        dispatchEvent(event, data) {
            if (this.listeners.has(event)) {
                this.listeners.get(event).forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error('Auth event error:', e);
                    }
                });
            }
        }
        
        getSession() {
            return this.validateSession() ? { ...this.session } : null;
        }
        
        isAuthenticated() {
            return this.validateSession();
        }
        
        getToken() {
            if (!this.isAuthenticated()) return null;
            
            try {
                const stored = localStorage.getItem(TOKEN_KEY);
                return stored ? this.cipher.decrypt(stored) : null;
            } catch (e) {
                return null;
            }
        }
    }
    
    // Authentication Core
    class AuthCore {
        constructor() {
            this.session = new SessionManager();
            this.requests = new Map();
            this.authWindow = null;
        }
        
        init(config = {}) {
            this.config = {
                apiUrl: config.apiUrl || '/api/auth',
                tokenHeader: config.tokenHeader || 'X-Auth-Token',
                autoLogin: config.autoLogin !== false,
                debug: config.debug || false,
                ...config
            };
            
            this.session.init();
            
            if (this.config.autoLogin && !this.session.isAuthenticated()) {
                this.tryAutoLogin();
            }
            
            this.setupInterceptors();
            return this;
        }
        
        async login(credentials) {
            try {
                // Simulate API call
                await this.simulateNetworkDelay();
                
                const mockResponse = {
                    success: true,
                    user: {
                        id: this.generateUserId(),
                        email: credentials.email || 'user@system.com',
                        name: 'System User',
                        role: 'admin',
                        permissions: ['read', 'write', 'execute']
                    },
                    token: this.generateToken(),
                    refreshToken: this.generateToken()
                };
                
                // Save session
                this.session.saveSession({
                    user: mockResponse.user,
                    token: mockResponse.token,
                    refreshToken: mockResponse.refreshToken,
                    loginTime: Date.now()
                });
                
                // Save encrypted token
                this.saveEncryptedToken(mockResponse.token);
                
                this.dispatch('login_success', mockResponse.user);
                return mockResponse;
                
            } catch (error) {
                this.dispatch('login_error', error);
                throw error;
            }
        }
        
        async logout() {
            try {
                // Simulate API call
                await this.simulateNetworkDelay();
                
                this.session.clearSession();
                this.dispatch('logout_success');
                
                return { success: true };
            } catch (error) {
                this.dispatch('logout_error', error);
                throw error;
            }
        }
        
        async register(data) {
            try {
                await this.simulateNetworkDelay();
                
                const mockResponse = {
                    success: true,
                    user: {
                        id: this.generateUserId(),
                        email: data.email,
                        name: data.name || 'New User',
                        role: 'user',
                        status: 'active'
                    },
                    token: this.generateToken()
                };
                
                this.session.saveSession({
                    user: mockResponse.user,
                    token: mockResponse.token,
                    registrationTime: Date.now()
                });
                
                this.saveEncryptedToken(mockResponse.token);
                this.dispatch('register_success', mockResponse.user);
                
                return mockResponse;
            } catch (error) {
                this.dispatch('register_error', error);
                throw error;
            }
        }
        
        async changePassword(data) {
            try {
                await this.simulateNetworkDelay();
                
                // Validate old password
                if (!data.oldPassword || data.oldPassword.length < 6) {
                    throw new Error('Invalid old password');
                }
                
                // Validate new password
                if (!data.newPassword || data.newPassword.length < 8) {
                    throw new Error('Password must be at least 8 characters');
                }
                
                return {
                    success: true,
                    message: 'Password changed successfully',
                    timestamp: Date.now()
                };
            } catch (error) {
                throw error;
            }
        }
        
        generateUserId() {
            return 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
        }
        
        generateToken() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let token = '';
            for (let i = 0; i < 32; i++) {
                token += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return 'tok_' + token + '_' + Date.now().toString(36);
        }
        
        saveEncryptedToken(token) {
            const cipher = new XorCipher();
            const encrypted = cipher.encrypt(token);
            localStorage.setItem(TOKEN_KEY, encrypted);
            
            // Save IV separately
            const iv = this.generateToken().substr(0, 16);
            localStorage.setItem(IV_KEY, btoa(iv));
        }
        
        simulateNetworkDelay() {
            return new Promise(resolve => {
                setTimeout(resolve, 300 + Math.random() * 700);
            });
        }
        
        tryAutoLogin() {
            // Check for stored credentials
            const stored = localStorage.getItem('auto_login');
            if (stored) {
                try {
                    const cipher = new XorCipher();
                    const credentials = JSON.parse(cipher.decrypt(stored));
                    setTimeout(() => {
                        this.login(credentials).catch(() => {
                            // Silent fail
                        });
                    }, 1000);
                } catch (e) {
                    // Ignore
                }
            }
        }
        
        setupInterceptors() {
            // Intercept fetch requests
            const originalFetch = window.fetch;
            
            window.fetch = async (...args) => {
                const [url, options = {}] = args;
                
                // Add auth headers if authenticated
                if (this.session.isAuthenticated() && !url.includes('auth/login')) {
                    const token = this.session.getToken();
                    if (token) {
                        options.headers = {
                            ...options.headers,
                            [this.config.tokenHeader]: token,
                            'X-Session-ID': this.session.getSession()?.id
                        };
                    }
                }
                
                // Add request ID
                const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                options.headers = {
                    ...options.headers,
                    'X-Request-ID': requestId
                };
                
                // Store request
                this.requests.set(requestId, {
                    url,
                    start: Date.now(),
                    method: options.method || 'GET'
                });
                
                try {
                    const response = await originalFetch(url, options);
                    
                    // Check for auth errors
                    if (response.status === 401) {
                        this.session.clearSession();
                        this.dispatch('auth_expired');
                    }
                    
                    // Log request completion
                    const request = this.requests.get(requestId);
                    if (request) {
                        request.end = Date.now();
                        request.duration = request.end - request.start;
                        this.requests.delete(requestId);
                    }
                    
                    return response;
                    
                } catch (error) {
                    this.requests.delete(requestId);
                    throw error;
                }
            };
        }
        
        dispatch(event, data) {
            const eventObj = new CustomEvent('auth_' + event, { detail: data });
            window.dispatchEvent(eventObj);
            
            if (this.config.debug) {
                console.log(`[Auth] ${event}:`, data);
            }
        }
        
        // Public API
        get currentUser() {
            const session = this.session.getSession();
            return session ? session.user : null;
        }
        
        get isLoggedIn() {
            return this.session.isAuthenticated();
        }
        
        get sessionId() {
            const session = this.session.getSession();
            return session ? session.id : null;
        }
        
        get token() {
            return this.session.getToken();
        }
    }
    
    // Initialize global instance
    global.AuthSystem = new AuthCore();
    
    // Auto-initialize with default config
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            global.AuthSystem.init({
                debug: localStorage.getItem('debug_auth') === 'true'
            });
        }, 100);
    });
    
})(window);