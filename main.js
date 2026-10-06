// النظام الرئيسي
(() => {
    'use strict';
    
    // النظام الأساسي
    class CoreSystem {
        #privateKey = 0xDEADBEEF;
        #modules = new WeakMap();
        #listeners = new Map();
        
        constructor() {
            this.#init();
            this.#start();
        }
        
        #init() {
            // تهيئة النظام
            this.#createEventSystem();
            this.#setupSecurity();
            this.#loadComponents();
        }
        
        #createEventSystem() {
            // نظام الأحداث المعقد
            const eventTypes = ['system:init', 'system:ready', 'module:loaded'];
            eventTypes.forEach(type => {
                this.#listeners.set(type, new Set());
            });
        }
        
        #setupSecurity() {
            // التحقق من التلاعب
            const integrityCheck = () => {
                const scripts = document.querySelectorAll('script[src]');
                const hashes = new Map();
                
                scripts.forEach(script => {
                    const url = script.src;
                    fetch(url)
                        .then(r => r.text())
                        .then(t => {
                            const hash = this.#generateHash(t);
                            hashes.set(url, hash);
                        });
                });
                
                // تخزين الهاشات
                sessionStorage.setItem('scriptHashes', 
                    JSON.stringify([...hashes]));
            };
            
            // فحص دوري
            setInterval(integrityCheck, 30000);
        }
        
        #generateHash(str) {
            // دالة هاش بسيطة
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(36);
        }
        
        #loadComponents() {
            // تحميل المكونات الديناميكية
            const components = ['ui', 'api', 'utils'];
            components.forEach(comp => {
                this.#loadModule(comp);
            });
        }
        
        #loadModule(name) {
            return new Promise((resolve) => {
                // محاكاة تحميل الوحدة
                const moduleCode = this.#decryptModule(name);
                const module = eval(`(${moduleCode})`);
                this.#modules.set(module, {name, loaded: Date.now()});
                
                // إرسال حدث
                this.#dispatch('module:loaded', {name, module});
                resolve(module);
            });
        }
        
        #decryptModule(name) {
            // فك التشفير البسيط
            const modules = {
                'ui': '() => ({ init: () => console.log("UI loaded") })',
                'api': '() => ({ fetch: () => Promise.resolve() })',
                'utils': '() => ({ encrypt: (d) => btoa(d) })'
            };
            
            // تطبيق XOR
            const code = modules[name];
            let decrypted = '';
            for (let i = 0; i < code.length; i++) {
                decrypted += String.fromCharCode(
                    code.charCodeAt(i) ^ 0x55
                );
            }
            return decrypted;
        }
        
        #dispatch(event, data) {
            const listeners = this.#listeners.get(event);
            if (listeners) {
                listeners.forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error('Event error:', e);
                    }
                });
            }
        }
        
        #start() {
            // بدء النظام
            setTimeout(() => {
                this.#dispatch('system:ready', {timestamp: Date.now()});
                console.info('System operational');
            }, 1000);
        }
        
        // واجهة عامة محدودة
        on(event, callback) {
            if (this.#listeners.has(event)) {
                this.#listeners.get(event).add(callback);
            }
        }
        
        get status() {
            return {
                modules: this.#modules.size,
                uptime: performance.now()
            };
        }
    }
    
    // بدء النظام عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        // تأخير عشوائي
        const delay = Math.random() * 500 + 100;
        setTimeout(() => {
            window.System = new CoreSystem();
            
            // تشفير البيانات في localStorage
            if (window.localStorage) {
                const data = {
                    init: Date.now(),
                    agent: navigator.userAgent.substring(0, 50),
                    v: '1.0'
                };
                const encrypted = btoa(JSON.stringify(data));
                localStorage.setItem('sys', encrypted);
            }
        }, delay);
    });
    
    // منع التتبع
    Object.defineProperty(document, 'hidden', {
        get: () => false,
        configurable: false
    });
    
    // تحسينات الأداء
    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback) {
        const start = performance.now();
        return originalRAF(function(timestamp) {
            const delta = timestamp - start;
            if (delta < 16) {
                callback(timestamp);
            } else {
                setTimeout(() => callback(timestamp), 0);
            }
        });
    };
})();

// نظام فرعي للرسوميات
(function() {
    const canvas = document.getElementById('q');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let particles = [];
    
    class Particle {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.vx = (Math.random() - 0.5) * 2;
            this.vy = (Math.random() - 0.5) * 2;
            this.alpha = Math.random() * 0.5 + 0.1;
            this.size = Math.random() * 1.5 + 0.5;
        }
        
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.alpha *= 0.995;
            
            // الانعكاس من الحواف
            if (this.x <= 0 || this.x >= canvas.width) this.vx *= -1;
            if (this.y <= 0 || this.y >= canvas.height) this.vy *= -1;
        }
        
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(100, 200, 255, ${this.alpha})`;
            ctx.fill();
        }
    }
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // إضافة جسيمات جديدة
        if (Math.random() < 0.3 && particles.length < 100) {
            particles.push(new Particle(
                Math.random() * canvas.width,
                Math.random() * canvas.height
            ));
        }
        
        // تحديث ورسم الجسيمات
        particles = particles.filter(p => p.alpha > 0.01);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        
        requestAnimationFrame(animate);
    }
    
    // بدء الرسوم المتحركة
    setTimeout(animate, 2000);
})();