            ctx.fillRect(this.x + eyeX, this.y, 4, 4); ctx.fillRect(this.x + eyeX + 8, this.y, 4, 4);
            ctx.fillStyle = '#ffdbac'; let handX = this.dir === 1 ? this.w - 5 : -5;
            ctx.fillRect(this.x + handX, this.y + 30, 10, 10);
        }
        jump() { if (this.onGround) { this.vy = this.jumpForce; playSound('jump'); } }
        takeDamage() {
            if (this.invul <= 0) {
                this.hp--; this.invul = 60; playSound('hit'); game.shake = 10;
                if (this.hp <= 0) game.gameOver();
            }
        }
    }

    const game = {
        canvas: null, ctx: null, player: new Player(), enemies: [], crosses: [], particles: [], platforms: [],
        score: 0, highScore: 0, phase: 1, state: 'MENU', keys: {},
        spawnTimer: 0, enemiesToSpawn: 0, shake: 0,

        init() {
            this.canvas = document.getElementById('gameCanvas');
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.canvas.width = CANVAS_WIDTH; this.canvas.height = CANVAS_HEIGHT;
            this.highScore = localStorage.getItem('fatherVsDemons_highScore') || 0;
            this.updateHUD();

            window.addEventListener('keydown', e => {
                this.keys[e.code] = true;
                if (e.code === 'Escape') this.togglePause();
                if (e.code === 'KeyR') this.restart();
                if (e.key >= '1' && e.key <= '7') {
                    const type = Object.values(CROSS_TYPES).find(t => t.id == e.key);
                    if (type && this.player.unlockedCrosses.includes(type.id)) {
                        this.player.selectedCross = type; this.updateHUD();
                    }
                }
            });
            window.addEventListener('keyup', e => this.keys[e.code] = false);
            this.setupMobile();
            requestAnimationFrame(() => this.loop());
        },

        setupMobile() {
            const bind = (id, code) => {
                const el = document.getElementById(id); if (!el) return;
                const handler = (e) => { e.preventDefault(); this.keys[code] = true; if(code === 'ControlLeft') this.shoot(); };
                const endHandler = (e) => { e.preventDefault(); this.keys[code] = false; };
                el.addEventListener('touchstart', handler, {passive: false});
                el.addEventListener('touchend', endHandler, {passive: false});
                el.addEventListener('mousedown', handler);
                el.addEventListener('mouseup', endHandler);
            };
            bind('btn-left', 'ArrowLeft'); bind('btn-right', 'ArrowRight');
            bind('btn-jump', 'Space'); bind('btn-shoot', 'ControlLeft');
        },

        start() {
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            this.player.reset(); this.score = 0; this.phase = 1;
            this.enemies = []; this.crosses = []; this.particles = [];
            this.startPhase(1);
            this.hideAllScreens();
            document.getElementById('hud').classList.remove('hidden');
        },

        startPhase(p) {
            this.phase = p; this.state = 'TRANSITION';
            this.enemies = []; this.enemiesToSpawn = 5 + (p * 3);
            this.platforms = [];
            if (p % 5 === 0 || p % 10 === 0) {
                this.platforms.push(new Platform(150, 380, 150, 20));
                this.platforms.push(new Platform(500, 380, 150, 20));
                this.platforms.push(new Platform(325, 250, 150, 20));
            }
            if (p % 10 === 0) this.enemiesToSpawn = 1;
            Object.values(CROSS_TYPES).forEach(t => {
                if (this.phase >= t.phase && !this.player.unlockedCrosses.includes(t.id)) {
                    this.player.unlockedCrosses.push(t.id); this.player.selectedCross = t;
                }
            });
            const ts = document.getElementById('transition-screen');
            if (ts) {
                ts.classList.remove('hidden');
                document.getElementById('transition-title').innerText = `FASE ${p}`;
                document.getElementById('transition-desc').innerText = p % 10 === 0 ? "BOSS INCOMING!" : `Elimine ${this.enemiesToSpawn} demônios`;
                setTimeout(() => { ts.classList.add('hidden'); this.state = 'PLAYING'; this.updateHUD(); }, 2000);
            } else { this.state = 'PLAYING'; this.updateHUD(); }
        },

        update() {
            if (this.state !== 'PLAYING') return;
            if (this.keys['ArrowLeft'] || this.keys['KeyA']) { this.player.vx = -this.player.speed; this.player.dir = -1; }
            else if (this.keys['ArrowRight'] || this.keys['KeyD']) { this.player.vx = this.player.speed; this.player.dir = 1; }
            else { this.player.vx = 0; }
            if (this.keys['ArrowUp'] || this.keys['Space']) this.player.jump();
            if (this.keys['ControlLeft'] || this.keys['KeyK']) { this.shoot(); this.keys['ControlLeft'] = false; this.keys['KeyK'] = false; }
            this.player.update(this.platforms);
            this.spawnTimer++;
            if (this.spawnTimer > Math.max(20, 60 - this.phase)) {
                this.spawnTimer = 0; if (this.enemiesToSpawn > 0) this.spawnEnemy();
            }
            this.enemies.forEach((e, index) => {
                e.update(this.player.x, this.player.y);
                if (e.active && this.checkCollision(this.player, e)) this.player.takeDamage();
                if (!e.active) this.enemies.splice(index, 1);
            });
            this.crosses.forEach((c, index) => {
                c.update(this.enemies);
                this.enemies.forEach(e => {
                    if (e.active && this.checkCollision(c, e)) {
                        e.hp -= c.damage; this.createExplosion(c.x, c.y, c.type.color);
                        if (c.type.effect === 'explode') this.areaDamage(c.x, c.y, 60, c.damage);
                        if (c.type.effect !== 'pierce') c.active = false;
                        if (e.hp <= 0) {
                            e.active = false; this.score += e.isBoss ? 1000 : 20;
                            playSound('explosion'); this.updateHUD();
                            setTimeout(() => {
                                if (this.state === 'PLAYING' && this.enemiesToSpawn <= 0 && this.enemies.filter(en => en.active).length === 0) {
                                    if (this.phase >= 30) this.victory(); else this.nextPhase();
                                }
                            }, 100);
                        } else { playSound('hit'); }
                    }
                });
                if (!c.active) this.crosses.splice(index, 1);
            });
            this.particles.forEach((p, index) => { p.update(); if (p.life <= 0) this.particles.splice(index, 1); });
            if (this.shake > 0) this.shake--;
        },

        spawnEnemy() {
            let type = 'basic';
            if (this.phase > 5 && Math.random() < 0.2) type = 'flyer';
            if (this.phase > 15 && Math.random() < 0.2) type = 'tank';
            if (this.phase % 10 === 0) type = 'boss';
            else if (this.phase % 5 === 0 && this.enemiesToSpawn === 1) type = 'miniboss';
            const x = Math.random() > 0.5 ? -50 : CANVAS_WIDTH + 50;
            const y = type === 'flyer' ? Math.random() * 300 + 100 : GROUND_Y - 40;
            this.enemies.push(new Enemy(x, y, type, this.phase));
            this.enemiesToSpawn--;
        },

        shoot() {
            const c = new Cross(this.player.x + (this.player.dir === 1 ? 40 : -10), this.player.y + 20, this.player.dir, this.player.selectedCross);
            this.crosses.push(c); playSound('shoot');
        },

        checkCollision(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; },
        areaDamage(x, y, radius, damage) {
            this.enemies.forEach(e => {
                if (Math.hypot(e.x + e.w/2 - x, e.y + e.h/2 - y) < radius) { e.hp -= damage; if (e.hp <= 0) e.active = false; }
            });
        },
        createExplosion(x, y, color) {
            for (let i = 0; i < 8; i++) this.particles.push(new Particle(x, y, color, Math.random()*3+1, (Math.random()-0.5)*8, (Math.random()-0.5)*8, 20));
        },

        draw() {
            if (!this.ctx) return;
            this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.ctx.save();
            if (this.shake > 0) this.ctx.translate((Math.random()-0.5)*this.shake, (Math.random()-0.5)*this.shake);
            this.ctx.fillStyle = '#111'; this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.ctx.fillStyle = '#222'; for(let i=0; i<5; i++) this.ctx.fillRect(i * 200 - (this.player.x * 0.2 % 200), 0, 40, CANVAS_HEIGHT);
            this.ctx.fillStyle = '#333'; this.ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
            this.platforms.forEach(p => p.draw(this.ctx));
            this.crosses.forEach(c => c.draw(this.ctx));
            this.enemies.forEach(e => e.draw(this.ctx));
            this.player.draw(this.ctx);
            this.particles.forEach(p => p.draw(this.ctx));
            this.ctx.restore();
        },

        loop() { this.update(); this.draw(); requestAnimationFrame(() => this.loop()); },
        updateHUD() {
            const h = document.getElementById('hearts'); if (h) h.innerText = "❤️".repeat(this.player.hp);
            const s = document.getElementById('score'); if (s) s.innerText = `SCORE: ${this.score}`;
            const p = document.getElementById('phase-info'); if (p) p.innerText = `FASE: ${this.phase}/30`;
            const hs = document.getElementById('high-score'); if (hs) hs.innerText = `HIGH SCORE: ${this.highScore}`;
            const indicator = document.getElementById('cross-type');
            if (indicator) {
                indicator.innerText = this.player.selectedCross.name;
                indicator.style.color = this.player.selectedCross.color;
            }
        },
        cycleCross() {
            if (this.state !== 'PLAYING') return;
            const unlocked = Object.values(CROSS_TYPES).filter(t => this.player.unlockedCrosses.includes(t.id));
            if (unlocked.length <= 1) return;
            const currentIndex = unlocked.findIndex(t => t.id === this.player.selectedCross.id);
            this.player.selectedCross = unlocked[(currentIndex + 1) % unlocked.length];
            this.updateHUD(); playSound('powerup');
        },
        nextPhase() { this.startPhase(this.phase + 1); },
        togglePause() {
            if (this.state === 'PLAYING') { this.state = 'PAUSED'; document.getElementById('pause-screen').classList.remove('hidden'); }
            else if (this.state === 'PAUSED') { this.state = 'PLAYING'; document.getElementById('pause-screen').classList.add('hidden'); }
        },
        gameOver() { this.state = 'GAMEOVER'; document.getElementById('game-over-screen').classList.remove('hidden'); this.checkHighScore(); },
        victory() { this.state = 'VICTORY'; document.getElementById('victory-screen').classList.remove('hidden'); this.checkHighScore(); },
        checkHighScore() { if (this.score > this.highScore) { this.highScore = this.score; localStorage.setItem('fatherVsDemons_highScore', this.highScore); } },
        restart() { this.hideAllScreens(); this.start(); },
        showMenu() { this.state = 'MENU'; this.hideAllScreens(); document.getElementById('menu-screen').classList.remove('hidden'); document.getElementById('hud').classList.add('hidden'); },
        showControls() { this.hideAllScreens(); document.getElementById('controls-screen').classList.remove('hidden'); },
        hideAllScreens() { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); }
    };

    // Export to window for global access (GitHub Pages compatibility)
    window.game = game;
    
    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => game.init());
    } else {
        game.init();
    }
})();
