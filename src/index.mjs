/**
 * Cloudflare Worker entry point.
 *
 * Exposes the MCP server over Streamable HTTP at `/mcp`.
 *
 * Optional protection (Roadmap 0.4): set the `MCP_API_KEY` secret
 * (`wrangler secret put MCP_API_KEY`) and every request to /mcp must carry it
 * (`Authorization: Bearer …`, `X-API-Key`, or `?key=`). Unset → open, as before.
 * CORS preflight is always answered so browser-based MCP clients can discover
 * the endpoint before authenticating.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./tools.mjs";
import { authorize, stripApiKeyFromUrl, unauthorizedResponse } from "./lib/auth.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Accept,Authorization,X-API-Key,MCP-Protocol-Version,MCP-Session-Id",
  "Access-Control-Expose-Headers": "MCP-Session-Id,MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shamela MCP</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Plus+Jakarta+Sans:wght@300;400;500;600&family=Aref+Ruqaa:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --gold-primary: #C9A84C;
            --gold-light: #E8CF88;
            --gold-dark: #8A6D2B;
            --bg-dark: #050B0A;
        }

        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: var(--bg-dark);
            color: #FDF8EC;
            overflow: hidden;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
        }
        
        .royal-title {
            font-family: 'Cinzel', serif;
        }
        
        .arabic-watermark {
            font-family: 'Aref Ruqaa', serif;
        }
        
        /* Animated Background Texture */
        .bg-texture {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: -3;
            background-image: radial-gradient(circle at 2px 2px, #C9A84C 1px, transparent 0); 
            background-size: 40px 40px;
            opacity: 0.05;
            pointer-events: none;
        }

        /* Ambient Blobs - Colorful Minimal */
        .blob-1 { position: fixed; top: -10%; left: -10%; width: 50vw; height: 50vw; border-radius: 50%; background-color: #00f2fe; filter: blur(150px); opacity: 0.15; z-index: -2; animation: blobMove1 25s infinite alternate ease-in-out; pointer-events: none;}
        .blob-2 { position: fixed; bottom: -10%; right: -10%; width: 60vw; height: 60vw; border-radius: 50%; background-color: #f093fb; filter: blur(160px); opacity: 0.15; z-index: -2; animation: blobMove2 28s infinite alternate ease-in-out; pointer-events: none;}
        .blob-3 { position: fixed; top: 30%; left: 40%; width: 40vw; height: 40vw; border-radius: 50%; background-color: #43e97b; filter: blur(140px); opacity: 0.12; z-index: -2; animation: blobMove3 32s infinite alternate ease-in-out; pointer-events: none;}
        .blob-4 { position: fixed; bottom: 20%; left: 10%; width: 45vw; height: 45vw; border-radius: 50%; background-color: #fee140; filter: blur(150px); opacity: 0.1; z-index: -2; animation: blobMove4 22s infinite alternate ease-in-out; pointer-events: none;}
        
        @keyframes blobMove1 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(20vw, 20vh) scale(1.1); } }
        @keyframes blobMove2 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(-20vw, -10vh) scale(1.2); } }
        @keyframes blobMove3 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(-10vw, 20vh) scale(1.1); } }
        @keyframes blobMove4 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(15vw, -20vh) scale(1.3); } }

        /* Glassmorphism */
        .glass-morphism {
            background: rgba(10, 15, 20, 0.15);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.5), inset 0 0 15px rgba(255,255,255,0.05);
            border-radius: 32px;
        }

        /* Main Content Animation */
        #hero-icon-container {
            opacity: 0;
            transform: scale(0.7) translateY(40px);
            filter: blur(20px) brightness(2);
        }
        
        #main-content {
            opacity: 0;
            transform: scale(0.9) translateY(30px);
            filter: blur(10px);
        }

        .animate-in #hero-icon-container {
            animation: geminiReveal 2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
            animation-delay: 0.8s;
        }

        .animate-in #main-content {
            animation: geminiReveal 2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
            animation-delay: 1.2s;
        }

        @keyframes geminiReveal {
            0% { opacity: 0; transform: scale(0.7) translateY(40px); filter: blur(20px) brightness(2); }
            100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0) brightness(1); }
        }

        /* Floating Calligraphy/Books in Background */
        .floating-element {
            position: fixed;
            color: rgba(201, 168, 76, 0.04);
            z-index: -1;
            animation: float 25s infinite ease-in-out;
            pointer-events: none;
            user-select: none;
            white-space: nowrap;
        }
        .fe-1 { top: 10%; left: 5%; font-size: 15rem; animation-delay: 0s; opacity: 0.05; }
        .fe-2 { bottom: 15%; right: 10%; font-size: 18rem; animation-delay: -5s; opacity: 0.05; }
        .fe-3 { top: 40%; left: 70%; font-size: 12rem; animation-delay: -12s; opacity: 0.04; }
        .fe-4 { top: 20%; right: 20%; font-size: 20rem; animation-delay: -8s; opacity: 0.03; }
        .fe-5 { bottom: 10%; left: 20%; font-size: 14rem; animation-delay: -3s; opacity: 0.05; }
        .fe-6 { top: 60%; left: 10%; font-size: 16rem; animation-delay: -15s; opacity: 0.04; }
        .fe-7 { top: 5%; right: 40%; font-size: 10rem; animation-delay: -20s; opacity: 0.03; }
        .fe-8 { bottom: 40%; right: 5%; font-size: 12rem; animation-delay: -7s; opacity: 0.04; }

        @keyframes float {
            0% { transform: translateY(0) rotate(-5deg); }
            50% { transform: translateY(-40px) rotate(5deg); }
            100% { transform: translateY(0) rotate(-5deg); }
        }
    </style>
</head>
<body class="h-screen w-screen overflow-hidden flex flex-col items-center justify-center relative p-4">
    
    <!-- Particle Canvas -->
    <canvas id="particle-canvas" class="fixed inset-0 pointer-events-none z-0"></canvas>

    <!-- Background Elements -->
    <div class="bg-texture"></div>
    <div class="blob-1"></div>
    <div class="blob-2"></div>
    <div class="blob-3"></div>
    <div class="blob-4"></div>
    
    <!-- Royal Arabic Calligraphy Watermarks -->
    <div class="arabic-watermark floating-element fe-1 text-white/30">ن</div>
    <div class="arabic-watermark floating-element fe-2 text-white/30">ق</div>
    <div class="arabic-watermark floating-element fe-3 text-white/30">ص</div>
    <div class="arabic-watermark floating-element fe-4 text-[#4facfe]/30">۞</div>
    <div class="arabic-watermark floating-element fe-5 text-[#f093fb]/30">ي</div>
    <div class="arabic-watermark floating-element fe-6 text-white/30">ط</div>
    <div class="arabic-watermark floating-element fe-7 text-[#43e97b]/30">ع</div>
    <div class="arabic-watermark floating-element fe-8 text-[#fee140]/30">✧</div>
    
    <!-- Main Content Container -->
    <main id="app-container" class="z-10 flex flex-col items-center w-full max-w-lg mx-auto -mt-12">
        
        <!-- Hero Icon Container (Top Table) -->
        <div id="hero-icon-container" class="glass-morphism p-4 md:p-5 mb-5 flex items-center justify-center">
            <div class="w-28 h-28 md:w-36 md:h-36 relative drop-shadow-[0_15px_35px_rgba(201,168,76,0.25)]">
            <svg viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#e8cf88"/>
                  <stop offset="50%" stop-color="#c9a84c"/>
                  <stop offset="100%" stop-color="#8a6d2b"/>
                </linearGradient>
                <filter id="shadowBlur" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4"/>
                </filter>
              </defs>
            
              <!-- Background Base Shadow for Open Book -->
              <ellipse id="ob-shadow" cx="162" cy="225" rx="70" ry="8" fill="#000" opacity="0" filter="url(#shadowBlur)"/>

              <!-- Book Stack (Placed higher) -->
              <g id="book-stack" transform="translate(160 120) scale(1.2) translate(-160 -210)">
                <ellipse cx="155" cy="245" rx="85" ry="8" fill="#000" opacity="0.4" filter="url(#shadowBlur)"/>
                
                <!-- Book 0 -->
                <g class="stack-book" data-color="#0f2233">
                  <rect x="80" y="198" width="20" height="74" rx="2.5" fill="#0f2233" stroke="#c9a84c" stroke-width="0.8"/>
                  <path d="M90 220 l4 6 -4 6 -4 -6 z" fill="none" stroke="#e8cf88" stroke-width="0.8" opacity="0.9"/>
                  <rect x="84" y="240" width="12" height="1.5" rx="0.5" fill="#c9a84c" opacity="0.4"/>
                </g>
                <!-- Book 1 -->
                <g class="stack-book" data-color="#4a2525">
                  <rect x="100" y="192" width="19" height="80" rx="2.5" fill="#4a2525" stroke="#d4b36a" stroke-width="0.8"/>
                  <path d="M109.5 216 l4 5 -4 5 -4 -5 z" fill="none" stroke="#e8cf88" stroke-width="0.8" opacity="0.9"/>
                  <rect x="104" y="236" width="11" height="1.5" fill="#c9a84c" opacity="0.4"/>
                </g>
                <!-- Book 2 -->
                <g class="stack-book" data-color="#184a3a">
                  <rect x="119" y="184" width="26" height="88" rx="3" fill="#184a3a" stroke="#e8cf88" stroke-width="0.9"/>
                  <path d="M132 212 l5 7 -5 7 -5 -7 z" fill="none" stroke="#e8cf88" stroke-width="0.8" opacity="0.9"/>
                  <rect x="124" y="230" width="16" height="1.5" fill="#c9a84c" opacity="0.4"/>
                </g>
                <!-- Book 3 -->
                <g class="stack-book" data-color="#2b1d1d">
                  <rect x="145" y="174" width="32" height="98" rx="3.5" fill="#2b1d1d" stroke="#e8cf88" stroke-width="1.1"/>
                  <path d="M161 210 l6 9 -6 9 -6 -9 z" fill="none" stroke="#e8cf88" stroke-width="0.8" opacity="0.9"/>
                  <rect x="150" y="230" width="22" height="1.5" fill="#c9a84c" opacity="0.4"/>
                </g>
                <!-- Book 4 -->
                <g class="stack-book" data-color="#102a4a">
                  <rect x="177" y="184" width="26" height="88" rx="3" fill="#102a4a" stroke="#e8cf88" stroke-width="0.9"/>
                  <path d="M190 212 l5 7 -5 7 -5 -7 z" fill="none" stroke="#e8cf88" stroke-width="0.8" opacity="0.9"/>
                  <rect x="182" y="230" width="16" height="1.5" fill="#c9a84c" opacity="0.4"/>
                </g>
                <!-- Book 5 -->
                <g class="stack-book" data-color="#2a4a3a">
                  <rect x="203" y="192" width="19" height="80" rx="2.5" fill="#2a4a3a" stroke="#d4b36a" stroke-width="0.8"/>
                  <path d="M212.5 218 l4 5 -4 5 -4 -5 z" fill="none" stroke="#e8cf88" stroke-width="0.8" opacity="0.9"/>
                  <rect x="207" y="236" width="11" height="1.5" fill="#c9a84c" opacity="0.4"/>
                </g>
                <!-- Book 6 -->
                <g class="stack-book" data-color="#4a3525">
                  <rect x="222" y="198" width="18" height="74" rx="2.5" fill="#4a3525" stroke="#c9a84c" stroke-width="0.8"/>
                  <path d="M231 222 l3 4 -3 4 -3 -4 z" fill="none" stroke="#e8cf88" stroke-width="0.8" opacity="0.9"/>
                  <rect x="226" y="240" width="10" height="1.5" rx="0.5" fill="#c9a84c" opacity="0.4"/>
                </g>
              </g>
              
              <!-- Dynamic Open Book (Proportional size, realistic arch) -->
              <g id="dynamic-open-book" transform="translate(162 220) scale(1)" style="opacity: 0; transform-origin: 162px 220px;">
                  <!-- Covers (Thicker, extending past pages) -->
                  <path id="ob-cover" d="M 0 -5 Q -42 -30 -88 0 L -90 62 Q -42 48 0 70 Q 42 48 90 62 L 88 0 Q 42 -30 0 -5 Z" fill="#4a2525" stroke="url(#goldGrad)" stroke-width="1.5" stroke-linejoin="round"/>
                  <!-- Pages Body (giving thickness) -->
                  <path d="M 0 -10 Q -40 -35 -85 -5 L -85 58 Q -40 43 0 65 Q 40 43 85 58 L 85 -5 Q 40 -35 0 -10 Z" fill="#d0bb8c"/>
                  <!-- Left Pages (Top layer) -->
                  <path d="M 0 -15 Q -40 -40 -85 -10 L -85 55 Q -40 40 0 60 Z" fill="#fdf6e3" stroke="#e8cf88" stroke-width="0.5"/>
                  <!-- Right Pages (Top layer) -->
                  <path d="M 0 -15 Q 40 -40 85 -10 L 85 55 Q 40 40 0 60 Z" fill="#fdf6e3" stroke="#e8cf88" stroke-width="0.5"/>
                  <!-- Subtle page curves/creases -->
                  <path d="M 0 -15 Q -20 -28 -40 -19" fill="none" stroke="#d4b36a" stroke-width="0.5" opacity="0.4"/>
                  <path d="M 0 -15 Q 20 -28 40 -19" fill="none" stroke="#d4b36a" stroke-width="0.5" opacity="0.4"/>
                  <!-- Center shadow/crease -->
                  <line x1="0" y1="-15" x2="0" y2="60" stroke="#8a6d2b" stroke-width="1.5" opacity="0.6"/>
                  <line x1="-1" y1="-15" x2="-1" y2="60" stroke="#000" stroke-width="1" opacity="0.2"/>
                  <!-- Flipping Page -->
                  <path id="ob-flipper" d="M 0 -15 Q 40 -40 85 -10 L 85 55 Q 40 40 0 60 Z" fill="#fffaf0" stroke="#d4b36a" stroke-width="0.5" style="transform-origin: 0px 0px; transform-box: fill-box; opacity: 0;"/>
              </g>
            </svg>
            </div>
        </div>

        <!-- Text & Data -->
        <div id="main-content" class="w-full flex flex-col items-center text-center px-4">
            
            <h1 class="royal-title text-4xl md:text-5xl font-bold mb-3 tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-[#E8CF88] via-[#C9A84C] to-[#8A6D2B] drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                Shamela MCP
            </h1>
            
            <p class="text-sm md:text-base text-white/90 font-light max-w-xs sm:max-w-sm mb-8 tracking-wide leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                Connecting AI agents to the world's largest Islamic digital library.
            </p>

            <!-- Status Indicator -->
            <div class="flex items-center gap-3 bg-white/5 border border-white/10 backdrop-blur-xl px-5 py-2.5 rounded-full drop-shadow-[0_4px_16px_rgba(0,0,0,0.4)] shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                <div class="w-2 h-2 rounded-full bg-[#00FF00] animate-pulse shadow-[0_0_8px_#00FF00]"></div>
                <span class="text-xs uppercase tracking-widest font-sans font-semibold text-white/90">System Operational</span>
            </div>
            
        </div>
    </main>

    <script>
        // Smooth page load animation
        window.addEventListener('DOMContentLoaded', () => {
            const appContainer = document.getElementById('app-container');
            
            // Trigger central content reveal
            setTimeout(() => {
                appContainer.classList.add('animate-in');
            }, 100);
        });

        // --- Particle Canvas Logic (Minimal Colorful Ambient) ---
        const canvas = document.getElementById('particle-canvas');
        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];

        function resize() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resize);
        resize();

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.size = Math.random() * 3 + 1;
                
                // Minimal Colorful Palette
                const colors = ['#00f2fe', '#4facfe', '#f093fb', '#f5576c', '#43e97b', '#fee140', '#9b59b6'];
                this.color = colors[Math.floor(Math.random() * colors.length)];
                
                this.angle = Math.random() * Math.PI * 2;
                this.speed = Math.random() * 0.2 + 0.05; // Very slow drift
                this.vx = Math.cos(this.angle) * this.speed;
                this.vy = Math.sin(this.angle) * this.speed;
                
                this.type = Math.random() > 0.6 ? 'diamond' : 'circle';
                this.opacity = Math.random() * 0.6 + 0.2;
                this.life = Math.random() * 1000;
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;
                
                // Slow wave effect
                this.x += Math.sin(this.life * 0.01) * 0.2;
                this.y += Math.cos(this.life * 0.01) * 0.2;
                
                // Screen wrap seamlessly
                if (this.x < -20) this.x = width + 20;
                if (this.x > width + 20) this.x = -20;
                if (this.y < -20) this.y = height + 20;
                if (this.y > height + 20) this.y = -20;
                
                this.life++;
            }

            draw() {
                ctx.save();
                ctx.translate(this.x, this.y);
                
                // Pulsing opacity
                const currentOpacity = this.opacity * (0.6 + 0.4 * Math.sin(this.life * 0.02));
                ctx.globalAlpha = Math.max(0, currentOpacity);
                
                ctx.fillStyle = this.color;
                ctx.shadowBlur = 15;
                ctx.shadowColor = this.color;
                
                ctx.beginPath();
                if (this.type === 'circle') {
                    ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                } else {
                    ctx.moveTo(0, -this.size * 1.5);
                    ctx.lineTo(this.size * 1.5, 0);
                    ctx.lineTo(0, this.size * 1.5);
                    ctx.lineTo(-this.size * 1.5, 0);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }

        // Initialize ambient particles
        for(let i = 0; i < 120; i++) particles.push(new Particle());

        function animate() {
            ctx.clearRect(0, 0, width, height);
            
            particles.forEach((p) => {
                p.update();
                p.draw();
            });

            requestAnimationFrame(animate);
        }
        animate();

        // --- Realistic Book Sequence Animation Logic ---
        function initBookAnimation() {
            const stackBooks = document.querySelectorAll('.stack-book');
            const openBookGroup = document.getElementById('dynamic-open-book');
            const obCover = document.getElementById('ob-cover');
            const flipper = document.getElementById('ob-flipper');
            
            if(!stackBooks.length || !openBookGroup || !flipper) return;

            let currentBookIndex = stackBooks.length - 1; // Start from right-most book

            async function runCycle() {
                const book = stackBooks[currentBookIndex];
                const color = book.getAttribute('data-color');
                
                // 1. Hide original book in stack
                book.style.opacity = '0';

                // 2. Create a flying clone
                const clone = book.cloneNode(true);
                clone.style.opacity = '1';
                book.parentNode.appendChild(clone);

                const rect = clone.querySelector('rect');
                const startX = parseFloat(rect.getAttribute('x'));
                const startY = parseFloat(rect.getAttribute('y'));
                const width = parseFloat(rect.getAttribute('width'));
                const height = parseFloat(rect.getAttribute('height'));
                
                // Calculate center point of the book
                const centerX = startX + width / 2;
                const centerY = startY + height / 2;
                
                // Target coordinates for flight (calculated to reach the lower open book position)
                const targetX = 162;
                const targetY = 220;
                const dx = targetX - centerX;
                const dy = targetY - centerY;
                
                // Rotation based on starting position (tilting naturally towards center)
                const rot = dx > 0 ? 15 : -15;

                // 3. Fly the clone and simulate rotating sideways (opening)
                const flyAnim = clone.animate([
                    { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 },
                    { transform: \`translate(\${dx * 0.5}px, \${dy * 0.4 - 50}px) scale(1.4) rotate(\${rot}deg)\`, opacity: 1, offset: 0.6 },
                    { transform: \`translate(\${dx}px, \${dy}px) scaleX(0.01) scaleY(1.4) rotate(0deg)\`, opacity: 0.8 }
                ], {
                    duration: 850,
                    easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
                    fill: 'forwards'
                });

                await flyAnim.finished;
                clone.remove(); // Clean up clone

                // 4. Reveal the realistic Open Book
                obCover.style.transition = 'none';
                obCover.style.fill = color;
                openBookGroup.style.opacity = '1';
                document.getElementById('ob-shadow').style.opacity = '0.3';
                
                // Animate opening scale
                const openAnim = openBookGroup.animate([
                    { transform: 'translate(162px, 220px) scaleX(0.01) scaleY(0.9)', opacity: 0.5 },
                    { transform: 'translate(162px, 220px) scaleX(1.05) scaleY(1.05)', opacity: 1 }
                ], {
                    duration: 400,
                    easing: 'ease-out',
                    fill: 'forwards'
                });
                await openAnim.finished;

                // Small pause after opening
                await new Promise(r => setTimeout(r, 200));
                
                // 5. Flip Pages twice to simulate reading (Right to Left)
                for(let i = 0; i < 2; i++) {
                    flipper.style.opacity = '1';
                    const flipAnim = flipper.animate([
                        { transform: 'scaleX(1) skewY(0deg)', fill: '#fffaf0' },
                        { transform: 'scaleX(0) skewY(-15deg)', fill: '#e8cf88', offset: 0.5 },
                        { transform: 'scaleX(-1) skewY(0deg)', fill: '#fdf6e3' }
                    ], {
                        duration: 800,
                        easing: 'ease-in-out'
                    });
                    
                    await flipAnim.finished;
                    flipper.style.opacity = '0'; // hide flipper again
                    await new Promise(r => setTimeout(r, 300)); // pause between flips
                }

                // Pause before putting the book back
                await new Promise(r => setTimeout(r, 400));

                // 6. Close and Fade Out Open Book
                const closeAnim = openBookGroup.animate([
                    { transform: 'translate(162px, 220px) scale(1.05)', opacity: 1 },
                    { transform: 'translate(162px, 220px) scale(0.95)', opacity: 0 }
                ], {
                    duration: 350,
                    easing: 'ease-in',
                    fill: 'forwards'
                });
                await closeAnim.finished;
                openBookGroup.style.opacity = '0';
                document.getElementById('ob-shadow').style.opacity = '0';

                // 7. Return original book back smoothly into the stack
                book.style.opacity = '1';
                book.animate([
                    { transform: 'translateY(15px)', opacity: 0 },
                    { transform: 'translateY(0px)', opacity: 1 }
                ], {
                    duration: 350,
                    easing: 'ease-out'
                });
                
                // Wait before moving the next book
                await new Promise(r => setTimeout(r, 900));
                
                // Right to left progression (Index goes 6 -> 5 -> 4...)
                currentBookIndex = (currentBookIndex - 1 + stackBooks.length) % stackBooks.length;
                runCycle(); // Loop endlessly
            }

            // Start animation loop after initial page entrance
            setTimeout(runCycle, 2000);
        }
        
        initBookAnimation();
    </script>
</body>
</html>`;

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      return new Response(LANDING_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    const auth = authorize(request, env);
    if (!auth.ok) {
      return unauthorizedResponse(auth.reason, { ...CORS, "WWW-Authenticate": 'Bearer realm="shamela-mcp"' });
    }
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    // Do not let a header-less client's API key become part of the URL seen by
    // the MCP transport or any downstream logging/session code.
    const safeUrl = stripApiKeyFromUrl(request.url);
    const transportRequest = safeUrl === request.url ? request : new Request(safeUrl, request);
    const res = await transport.handleRequest(transportRequest);
    // Mirror the permissive CORS the preflight promised on the real response.
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) if (!headers.has(k)) headers.set(k, v);
    if (auth.deprecated) {
      headers.set("Deprecation", "true");
      headers.set("Warning", '299 shamela-mcp "Query-string API keys are deprecated; use Authorization: Bearer or X-API-Key"');
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
