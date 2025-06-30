// --- Pet Images ---
const petImgLeft = new Image();
const petImgRight = new Image();
const petImgSleep = new Image();
const petImgSleepR = new Image();
petImgLeft.src = 'icon/pig-left.png';
petImgRight.src = 'icon/pig-right.png';
petImgSleep.src = 'icon/pig-sleep.png';
petImgSleepR.src = 'icon/pig-sleepR.png';

// --- Ball Images ---
const ballImages = [
  'icon/ball1.png',
  'icon/ball2.png',
  'icon/ball3.png'
];
const BALL_DISPLAY_SIZE = 50;
const BALL_RADIUS = BALL_DISPLAY_SIZE / 2;

// --- Canvas and Rendering ---
const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');
const PET_WIDTH = 102, PET_HEIGHT = 102;

// --- Pet Animation State ---
let petX, petY;
let vx = 0, vy = 0, gravity = 0.4;
let direction = -1; // -1=left, 1=right
let isSleeping = false;
let sleepSequenceActive = false;
let sleepRequested = false;
let sleepSequenceStep = 0;
let currentImg;
let resumeDirection;
let resumeImg;
let pendingSleep = false;
let pendingWake = false;
let wakeTimeoutId = null;

// --- Stats Logic ---
let pet = {
  happiness: 50,
  hunger: 50,
  cleanliness: 50,
  health: 50,
};

// --- Ball Physics ---
const balls = [
  { x: 100, y: 50, vx: 2, vy: 0, radius: BALL_RADIUS, img: null },
  { x: 300, y: 80, vx: -1.5, vy: 0, radius: BALL_RADIUS, img: null },
  { x: 500, y: 30, vx: 1, vy: 0, radius: BALL_RADIUS, img: null }
];

const ballGravity = 0.5;
const ballAirFriction = 0.99;
const ballBounce = 0.7;

// --- Shared Ground Logic ---
function getGroundY() {
  // Both pig and balls use the same ground level for realism
  return canvas.height - PET_HEIGHT;
}

// --- UI Helpers ---
function setButtonsDisabled(disabled) {
  document.querySelectorAll('button').forEach(btn => {
    btn.disabled = disabled;
  });
}

function updateStats() {
  document.getElementById('happiness').textContent = pet.happiness;
  document.getElementById('hunger').textContent = pet.hunger;
  document.getElementById('cleanliness').textContent = pet.cleanliness;
  document.getElementById('health').textContent = pet.health;
}

// --- Responsive Canvas ---
function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = 300;
  // Clamp pet position
  if (typeof petX !== 'undefined' && typeof petY !== 'undefined') {
    petX = Math.min(Math.max(petX, 0), canvas.width - PET_WIDTH - 10);
    petY = canvas.height - PET_HEIGHT;
  }
}
window.addEventListener('resize', resizeCanvas);

// --- Image Preload Helper ---
function loadImages(images) {
  return Promise.all(
    images.map(
      img =>
        new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        })
    )
  );
}

// --- Ball Image Preload ---
function loadBallImages() {
  return Promise.all(
    ballImages.map(
      (src, i) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            balls[i].img = img;
            resolve();
          };
          img.onerror = reject;
        })
    )
  );
}

// --- Pet Care Functions (exposed to window) ---
window.feedPet = function() {
  pet.hunger = Math.max(0, pet.hunger - 15);
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
  registerBackgroundSync('sync-feed-pet');
};
window.playWithPet = function() {
  pet.happiness = Math.min(100, pet.happiness + 10);
  pet.hunger = Math.min(100, pet.hunger + 5);
  updateStats();
};
window.cleanPet = function() {
  pet.cleanliness = 100;
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
};
window.sleepPet = function() {
  pet.health = Math.min(100, pet.health + 10);
  pet.hunger = Math.min(100, pet.hunger + 10);
  updateStats();
  if (!isSleeping && !sleepSequenceActive && !sleepRequested) {
    sleepRequested = true;
    resumeDirection = direction;
    resumeImg = (direction === 1) ? petImgRight : petImgLeft;
    pendingSleep = true;
  }
};
window.healPet = function() {
  pet.health = 100;
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
};

// --- Sleep Sequence Logic ---
function runSleepSequence() {
  sleepSequenceStep = 1;
  sleepSequenceActive = true;
  sleepRequested = false;
  setButtonsDisabled(true);

  let imgA = resumeImg;
  let imgB = (resumeImg === petImgRight) ? petImgLeft : petImgRight;
  let sleepImg = (resumeImg === petImgRight) ? petImgSleepR : petImgSleep;

  currentImg = imgA;

  setTimeout(() => {
    currentImg = imgB;
    setTimeout(() => {
      currentImg = imgA;
      setTimeout(() => {
        currentImg = imgB;
        setTimeout(() => {
          currentImg = sleepImg;
          isSleeping = true;
          sleepSequenceActive = false;
          setTimeout(() => {
            // Wake up phase: stay still for 2 seconds before jumping
            currentImg = imgA;
            isSleeping = false;
            pendingWake = true;
            vx = 0; // Ensure pig stays still during wake phase
            vy = 0;
            wakeTimeoutId = setTimeout(() => {
              pendingWake = false;
              sleepSequenceStep = 0;
              sleepSequenceActive = false;
              direction = resumeDirection;
              currentImg = (direction === 1) ? petImgRight : petImgLeft;
              startJump();
              setButtonsDisabled(false);
            }, 2000);
          }, 5000);
        }, 500);
      }, 500);
    }, 500);
  }, 1000);
}

function startJump() {
  const speed = 6, angle = Math.PI * 65 / 180;
  vx = direction * speed * Math.cos(angle);
  vy = -speed * Math.sin(angle);
}

// --- Animation/Background ---
function drawBackground() {
  ctx.fillStyle = '#90EE90';
  ctx.fillRect(0, getGroundY(), canvas.width, canvas.height - getGroundY());
  ctx.fillStyle = '#ADD8E6';
  ctx.fillRect(0, 0, canvas.width, getGroundY());
  // Draw ground line for balls (optional for debug)
  // ctx.beginPath();
  // ctx.moveTo(0, getGroundY() + BALL_RADIUS);
  // ctx.lineTo(canvas.width, getGroundY() + BALL_RADIUS);
  // ctx.strokeStyle = '#aaa';
  // ctx.stroke();
}

// --- Ball Physics Update ---
function updateBalls() {
  // Ball-to-ball collisions (simple elastic, equal mass)
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const b1 = balls[i];
      const b2 = balls[j];
      const dx = b2.x - b1.x;
      const dy = b2.y - b1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = b1.radius + b2.radius;
      if (dist < minDist) {
        // Minimal translation distance to separate balls
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        b1.x -= nx * overlap;
        b1.y -= ny * overlap;
        b2.x += nx * overlap;
        b2.y += ny * overlap;

        // Calculate velocities along the normal
        const dvx = b2.vx - b1.vx;
        const dvy = b2.vy - b1.vy;
        const vn = dvx * nx + dvy * ny;
        if (vn < 0) { // Only resolve if balls moving toward each other
          // Exchange velocities (perfectly elastic, equal mass)
          const impulse = 2 * vn / 2; // mass cancels out
          b1.vx += impulse * nx;
          b1.vy += impulse * ny;
          b2.vx -= impulse * nx;
          b2.vy -= impulse * ny;
          // Slightly dampen after collision
          b1.vx *= ballBounce;
          b1.vy *= ballBounce;
          b2.vx *= ballBounce;
          b2.vy *= ballBounce;
        }
      }
    }
  }

  // Ball motion, ground and wall bounce
  for (const ball of balls) {
    // Gravity
    ball.vy += ballGravity;
    // Air friction
    ball.vx *= ballAirFriction;
    ball.vy *= ballAirFriction;
    // Move
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Bounce off ground (shared with pig)
    const groundY = getGroundY();
    if (ball.y + BALL_RADIUS > groundY + BALL_RADIUS) {
      ball.y = groundY;
      ball.vy *= -ballBounce;
      if (Math.abs(ball.vy) < 1) ball.vy = 0; // settle
    }

    // Bounce off walls
    if (ball.x - BALL_RADIUS < 0) {
      ball.x = BALL_RADIUS;
      ball.vx *= -ballBounce;
    }
    if (ball.x + BALL_RADIUS > canvas.width) {
      ball.x = canvas.width - BALL_RADIUS;
      ball.vx *= -ballBounce;
    }
  }
}

// --- Ball Drawing ---
function drawBalls() {
  for (const ball of balls) {
    if (ball.img) {
      ctx.drawImage(
        ball.img,
        ball.x - BALL_RADIUS,
        ball.y - BALL_RADIUS,
        BALL_DISPLAY_SIZE,
        BALL_DISPLAY_SIZE
      );
    }
  }
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();

  // Ball physics and drawing
  updateBalls();
  drawBalls();

  // Only move pet if not sleeping, not in sleep sequence, not pendingWake
  if (!isSleeping && !sleepSequenceActive && !pendingWake) {
    vy += gravity;
    petX += vx;
    petY += vy;
  }

  // Wall bounce for pig
  if (!isSleeping && !sleepSequenceActive && !pendingWake) {
    if (petX <= 0) {
      petX = 0;
      direction = 1;
      vx = Math.abs(vx);
      currentImg = petImgRight;
    } else if (petX + PET_WIDTH >= canvas.width) {
      petX = canvas.width - PET_WIDTH;
      direction = -1;
      vx = -Math.abs(vx);
      currentImg = petImgLeft;
    }
  }

  // Landing logic
  let groundY = getGroundY();
  if (petY >= groundY) {
    petY = groundY;
    if (pendingSleep) {
      vx = 0;
      vy = 0;
      pendingSleep = false;
      runSleepSequence();
    } else if (!isSleeping && !sleepSequenceActive && !sleepRequested && !pendingWake) {
      startJump();
    }
  }

  ctx.drawImage(currentImg, petX, petY, PET_WIDTH, PET_HEIGHT);

  requestAnimationFrame(animate);
}

// --- Background Sync helper ---
function registerBackgroundSync(tag) {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(registration => {
      registration.sync.register(tag).catch(() => {});
    });
  }
}

// --- Service Worker hot update logic ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then(registration => {
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller && !window.__reloading__) {
              window.__reloading__ = true;
              window.location.reload();
            }
          }
        });
      }
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!window.__reloading__) {
      window.__reloading__ = true;
      window.location.reload();
    }
  });
}

// --- Startup: Only launch once ---
window.addEventListener('DOMContentLoaded', () => {
  if (window.__pet_loaded__) return;
  window.__pet_loaded__ = true;
  resizeCanvas();
  updateStats();
  Promise.all([
    loadImages([petImgLeft, petImgRight, petImgSleep, petImgSleepR]),
    loadBallImages()
  ])
    .then(() => {
      petX = canvas.width - PET_WIDTH - 10;
      petY = canvas.height - PET_HEIGHT;
      currentImg = petImgLeft;
      resumeDirection = direction;
      resumeImg = currentImg;
      animate();
    })
    .catch((err) => {
      console.error("One or more images failed to load.", err);
    });
});
