/**
 * API System v2.8.3 - Secure Communication Layer
 */

(function(global){
    'use strict';
    
    const API_VERSION = '2.8.3';
    const CACHE_KEY = 'api_cache_v2';
    const REQUEST_TIMEOUT = 30000;
    
    // Request Queue System
    class RequestQueue {
        constructor() {
            this.queue = [];
            this.processing = false;
            this.maxConcurrent = 3;
            this.activeRequests = 0;
        }
        
        async add(request) {
            return new Promise((resolve, reject) => {
                this.queue.push({
                    request,
                    resolve,
                    reject,
                    timestamp: Date.now()
                });
                this.process();
            });
        }
        
        async process() {
            if (this.processing || this.activeRequests >= this.maxConcurrent) return;
            
            this.processing = true;
            
            while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
                const item = this.queue.shift();
                this.activeRequests++;
                
                try {
                    const result = await this.executeRequest(item.request);
                    item.resolve(result);
                } catch (error) {
                    item.reject(error);
                } finally {
                    this.activeRequests--;
                }
            }
            
            this.processing = false;
            
            if (this.queue.length > 0) {
                setTimeout(() => this.process(), 10);
            }
        }
        
        async executeRequest(request) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
            
            try {
                const response = await fetch(request.url, {
                    ...request.options,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        }
    }
    
    // Cache System
    class CacheManager {
        constructor() {
            this.cache = new Map();
            this.maxSize = 100;
        }
        
        get(key) {
            const item = this.cache.get(key);
            if (!item) return null;
            
            // Check expiry
            if (item.expiry && Date.now() > item.expiry) {
                this.cache.delete(key);
                return null;
            }
            
            return item.data;
        }
        
        set(key, data, ttl = 60000) { // Default 1 minute
            // Clean old entries if cache is full
            if (this.cache.size >= this.maxSize) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
            
            this.cache.set(key, {
                data,
                expiry: ttl ? Date.now() + ttl : null,
                timestamp: Date.now()
            });
            
            this.persistCache();
        }
        
        delete(key) {
            this.cache.delete(key);
            this.persistCache();
        }
        
        clear() {
            this.cache.clear();
            localStorage.removeItem(CACHE_KEY);
        }
        
        persistCache() {
            try {
                const cacheData = {
                    timestamp: Date.now(),
                    entries: Array.from(this.cache.entries())
                };
                localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            } catch (e) {
                // Ignore storage errors
            }
        }
        
        loadCache() {
            try {
                const stored = localStorage.getItem(CACHE_KEY);
                if (stored) {
                    const cacheData = JSON.parse(stored);
                    // Only load cache less than 1 hour old
                    if (Date.now() - cacheData.timestamp < 3600000) {
                        this.cache = new Map(cacheData.entries);
                    }
                }
            } catch (e) {
                this.clear();
            }
        }
    }
    
    // API Core
    class APICore {
        constructor() {
            this.queue = new RequestQueue();
            this.cache = new CacheManager();
            this.interceptors = {
                request: [],
                response: [],
                error: []
            };
            this.metrics = {
                requests: 0,
                successes: 0,
                errors: 0,
                cacheHits: 0
            };
            
            this.baseURL = this.detectBaseURL();
            this.config = {
                timeout: REQUEST_TIMEOUT,
                retryAttempts: 2,
                retryDelay: 1000,
                enableCache: true,
                enableMetrics: true,
                compressRequests: true
            };
            
            this.init();
        }
        
        init() {
            this.cache.loadCache();
            this.setupEventListeners();
            this.startMetricsReport();
        }
        
        detectBaseURL() {
            const protocol = window.location.protocol;
            const host = window.location.host;
            const path = window.location.pathname.split('/').slice(0, -1).join('/');
            
            return `${protocol}//${host}${path}/api`;
        }
        
        setupEventListeners() {
            // Network status monitoring
            window.addEventListener('online', () => {
                this.dispatchEvent('network_online');
                this.flushFailedRequests();
            });
            
            window.addEventListener('offline', () => {
                this.dispatchEvent('network_offline');
            });
            
            // Visibility change
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.validateCache();
                }
            });
        }
        
        async request(endpoint, options = {}) {
            this.metrics.requests++;
            
            const requestId = this.generateRequestId();
            const url = this.buildURL(endpoint);
            const cacheKey = this.generateCacheKey(endpoint, options);
            
            // Check cache first
            if (this.config.enableCache && options.method === 'GET') {
                const cached = this.cache.get(cacheKey);
                if (cached) {
                    this.metrics.cacheHits++;
                    this.dispatchEvent('cache_hit', { endpoint, requestId });
                    return this.createResponse(cached, true);
                }
            }
            
            // Apply request interceptors
            let processedOptions = { ...options };
            for (const interceptor of this.interceptors.request) {
                processedOptions = await interceptor(processedOptions, endpoint);
            }
            
            // Add default headers
            processedOptions.headers = {
                'Content-Type': 'application/json',
                'X-API-Version': API_VERSION,
                'X-Request-ID': requestId,
                'X-Timestamp': Date.now().toString(),
                ...processedOptions.headers
            };
            
            // Compress request data if enabled
            if (this.config.compressRequests && processedOptions.body) {
                processedOptions.body = this.compressData(processedOptions.body);
                processedOptions.headers['X-Compressed'] = 'true';
            }
            
            const queueItem = {
                url,
                options: processedOptions
            };
            
            try {
                // Execute with retry logic
                const response = await this.executeWithRetry(queueItem);
                
                // Apply response interceptors
                let processedResponse = response;
                for (const interceptor of this.interceptors.response) {
                    processedResponse = await interceptor(processedResponse, endpoint);
                }
                
                // Parse response
                const data = await this.parseResponse(processedResponse);
                
                // Cache successful GET responses
                if (this.config.enableCache && 
                    options.method === 'GET' && 
                    processedResponse.ok) {
                    this.cache.set(cacheKey, data, options.cacheTTL);
                }
                
                this.metrics.successes++;
                this.dispatchEvent('request_success', { 
                    endpoint, 
                    requestId, 
                    duration: Date.now() - parseInt(processedOptions.headers['X-Timestamp']) 
                });
                
                return data;
                
            } catch (error) {
                this.metrics.errors++;
                
                // Apply error interceptors
                let processedError = error;
                for (const interceptor of this.interceptors.error) {
                    processedError = await interceptor(processedError, endpoint);
                }
                
                this.dispatchEvent('request_error', { 
                    endpoint, 
                    requestId, 
                    error: processedError 
                });
                
                throw processedError;
            }
        }
        
        async executeWithRetry(request, attempt = 0) {
            try {
                return await this.queue.add(request);
            } catch (error) {
                if (attempt < this.config.retryAttempts && this.shouldRetry(error)) {
                    await this.delay(this.config.retryDelay * (attempt + 1));
                    return this.executeWithRetry(request, attempt + 1);
                }
                throw error;
            }
        }
        
        shouldRetry(error) {
            // Retry on network errors or 5xx responses
            return error.name === 'TypeError' || // Network error
                   (error.status >= 500 && error.status < 600);
        }
        
        async delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        buildURL(endpoint) {
            // Handle absolute URLs
            if (endpoint.startsWith('http')) {
                return endpoint;
            }
            
            // Handle relative URLs
            if (endpoint.startsWith('/')) {
                return `${window.location.origin}${endpoint}`;
            }
            
            // Handle API endpoints
            return `${this.baseURL}/${endpoint}`;
        }
        
        generateRequestId() {
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substr(2, 6);
            return `req_${timestamp}_${random}`;
        }
        
        generateCacheKey(endpoint, options) {
            const keyData = {
                endpoint,
                method: options.method || 'GET',
                body: options.body,
                headers: options.headers
            };
            return btoa(JSON.stringify(keyData)).substr(0, 100);
        }
        
        compressData(data) {
            if (typeof data === 'object') {
                return JSON.stringify(data);
            }
            return data;
        }
        
        async parseResponse(response) {
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                return {
                    data,
                    status: response.status,
                    headers: Object.fromEntries(response.headers.entries()),
                    ok: response.ok,
                    timestamp: Date.now()
                };
            }
            
            const text = await response.text();
            return {
                data: text,
                status: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                ok: response.ok,
                timestamp: Date.now()
            };
        }
        
        createResponse(data, fromCache = false) {
            return {
                data,
                status: 200,
                headers: {},
                ok: true,
                fromCache,
                timestamp: Date.now()
            };
        }
        
        // Convenience methods
        async get(endpoint, params = {}, options = {}) {
            const query = new URLSearchParams(params).toString();
            const url = query ? `${endpoint}?${query}` : endpoint;
            return this.request(url, { ...options, method: 'GET' });
        }
        
        async post(endpoint, data = {}, options = {}) {
            return this.request(endpoint, {
                ...options,
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
        
        async put(endpoint, data = {}, options = {}) {
            return this.request(endpoint, {
                ...options,
                method: 'PUT',
                body: JSON.stringify(data)
            });
        }
        
        async patch(endpoint, data = {}, options = {}) {
            return this.request(endpoint, {
                ...options,
                method: 'PATCH',
                body: JSON.stringify(data)
            });
        }
        
        async delete(endpoint, options = {}) {
            return this.request(endpoint, { ...options, method: 'DELETE' });
        }
        
        // Interceptor management
        addRequestInterceptor(interceptor) {
            this.interceptors.request.push(interceptor);
        }
        
        addResponseInterceptor(interceptor) {
            this.interceptors.response.push(interceptor);
        }
        
        addErrorInterceptor(interceptor) {
            this.interceptors.error.push(interceptor);
        }
        
        // Cache management
        clearCache() {
            this.cache.clear();
        }
        
        invalidateCache(pattern) {
            for (const [key] of this.cache.cache) {
                if (key.includes(pattern)) {
                    this.cache.delete(key);
                }
            }
        }
        
        validateCache() {
            // Remove expired cache entries
            for (const [key, value] of this.cache.cache) {
                if (value.expiry && Date.now() > value.expiry) {
                    this.cache.delete(key);
                }
            }
        }
        
        // Failed requests management
        flushFailedRequests() {
            // Implementation for retrying failed requests
            this.dispatchEvent('flush_requests');
        }
        
        // Metrics
        startMetricsReport() {
            setInterval(() => {
                if (this.config.enableMetrics) {
                    this.reportMetrics();
                }
            }, 60000); // Every minute
        }
        
        reportMetrics() {
            const metrics = {
                ...this.metrics,
                timestamp: Date.now(),
                cacheSize: this.cache.cache.size,
                queueSize: this.queue.queue.length,
                activeRequests: this.queue.activeRequests
            };
            
            this.dispatchEvent('metrics_report', metrics);
            
            // Reset counters
            this.metrics.requests = 0;
            this.metrics.successes = 0;
            this.metrics.errors = 0;
            this.metrics.cacheHits = 0;
        }
        
        getMetrics() {
            return { ...this.metrics };
        }
        
        // Event system
        dispatchEvent(event, data) {
            const eventObj = new CustomEvent(`api_${event}`, { detail: data });
            window.dispatchEvent(eventObj);
        }
        
        on(event, callback) {
            window.addEventListener(`api_${event}`, (e) => callback(e.detail));
        }
        
        // Utility methods
        createMockResponse(data, status = 200) {
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve({
                        data,
                        status,
                        ok: status >= 200 && status < 300,
                        timestamp: Date.now()
                    });
                }, 300 + Math.random() * 700);
            });
        }
        
        simulateError(errorType = 'network', message = 'Simulated error') {
            const errors = {
                network: new Error('Network Error'),
                timeout: new Error('Request Timeout'),
                server: { 
                    data: { error: message }, 
                    status: 500, 
                    ok: false 
                }
            };
            
            throw errors[errorType] || new Error(message);
        }
    }
    
    // Initialize global instance
    global.APISystem = new APICore();
    
    // Auto-configure based on environment
    document.addEventListener('DOMContentLoaded', () => {
        // Detect development mode
        const isDev = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
        
        if (isDev) {
            global.APISystem.config.enableCache = false;
            global.APISystem.config.enableMetrics = true;
        }
        
        // Add default interceptors
        global.APISystem.addRequestInterceptor(async (options) => {
            // Add auth token if available
            if (window.AuthSystem && window.AuthSystem.token) {
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${window.AuthSystem.token}`
                };
            }
            return options;
        });
        
        global.APISystem.addResponseInterceptor(async (response) => {
            // Handle token refresh
            if (response.status === 401 && window.AuthSystem) {
                // Attempt to refresh token
                window.dispatchEvent(new CustomEvent('auth_token_expired'));
            }
            return response;
        });
        
        global.APISystem.addErrorInterceptor(async (error) => {
            // Log errors
            console.error('[API Error]', error);
            return error;
        });
    });
    
})(window);

// Example usage:
/*
// GET request
const data = await APISystem.get('users');
const data = await APISystem.get('users', { page: 1, limit: 10 });

// POST request
const result = await APISystem.post('users', { 
    name: 'John', 
    email: 'john@example.com' 
});

// With custom headers
const result = await APISystem.get('data', {}, {
    headers: { 'X-Custom-Header': 'value' }
});

// With caching
const result = await APISystem.get('products', {}, {
    cacheTTL: 300000 // 5 minutes
});

// Event listeners
APISystem.on('request_success', (data) => {
    console.log('Request successful:', data);
});

APISystem.on('request_error', (error) => {
    console.error('Request failed:', error);
});
*/