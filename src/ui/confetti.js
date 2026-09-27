// Confetti burst on solve, drawn on the full-screen #confettiCanvas.

const CONFETTI_COLORS = ['#1B5FD6', '#D96C4A', '#2E7D4F', '#F2C14E', '#8C7CFF', '#E23E57'];
let canvas = null;
let ctx = null;
let particles = [];
let running = false;

export function launchConfetti() {
  if (!canvas) {
    canvas = document.getElementById('confettiCanvas');
    ctx = canvas.getContext('2d');
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const originX = canvas.width / 2;
  const count = 160;
  particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.random() * Math.PI) + Math.PI; // upward-ish spread
    const speed = 6 + Math.random() * 10;
    particles.push({
      x: originX + (Math.random() - 0.5) * 60,
      y: canvas.height * 0.35,
      vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1),
      vy: Math.sin(angle) * speed - 6,
      size: 5 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
      life: 0,
      maxLife: 110 + Math.random() * 40
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let alive = false;
  for (const p of particles) {
    p.life++;
    if (p.life > p.maxLife) continue;
    alive = true;
    p.vy += 0.28; // gravity
    p.vx *= 0.995;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotSpeed;
    const fade = Math.max(0, 1 - p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    if (p.shape === 'rect') {
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (alive) {
    requestAnimationFrame(tick);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    running = false;
  }
}
