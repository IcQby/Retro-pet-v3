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

// --- Pig Ball Avoidance State ---
let pigAvoidingBall = false;
let pigAvoidBallDirection = 0;

// --- Stats Logic ---
let pet = {
  happiness: 50,
  hunger: 50,
  cleanliness: 50,
  health: 50,
};

// --- Ball State (only one at a time) ---
let ball = null;
let ballImgObjects = [];

const ballGravity = 0.5;
const ballAirFriction = 0.99;
const ballBounce = 0.7;

// --- Ball Visibility Logic ---
let showBall = false;
let ballAlpha = 1;
let showBallTimeout = null;
let fadeBallTimeout = null;

// --- Action Lock ---
let actionInProgress = false;

// --- Ball Gone Pause Logic ---
let justPausedAfterBall = false;
let ballGonePauseUntil = 0;

// --- Shared Ground Logic ---
function getGroundY() {
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

function loadBallImages() {
  return Promise.all(
    ballImages.map((src, i) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          ballImgObjects[i] = img;
          resolve();
        };
        img.onerror = reject;
      })
    )
  );
}

// --- Pet Care Functions (exposed to window) ---
function effectGuard(fn) {
  return function (...args) {
    if (actionInProgress) return;
    fn.apply(this, args);
  };
}

window.feedPet = effectGuard(function () {
  lockActionsForDuration(1000);
  pet.hunger = Math.max(0, pet.hunger - 15);
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
});
window.playWithPet = effectGuard(function () {
  lockActionsForDuration(15000);
  pet.happiness = Math.min(100, pet.happiness + 10);
  pet.hunger = Math.min(100, pet.hunger + 5);
  updateStats();
  showBallForDuration();
});
window.cleanPet = effectGuard(function () {
  lockActionsForDuration(2000);
  pet.cleanliness = 100;
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
});
window.sleepPet = effectGuard(function () {
  lockActionsForDuration(9000);
  pet.health = Math.min(100, pet.health + 10);
  pet.hunger = Math.min(100, pet.hunger + 10);
  updateStats();
  if (!isSleeping && !sleepSequenceActive && !sleepRequested) {
    sleepRequested = true;
    resumeDirection = direction;
    resumeImg = (direction === 1) ? petImgRight : petImgLeft;
    pendingSleep = true;
    // If pig is on ground, start sequence right away:
    if (petY === getGroundY()) {
      vx = 0; vy = 0; pendingSleep = false; runSleepSequence();
    }
  }
});
window.healPet = effectGuard(function () {
  lockActionsForDuration(1000);
  pet.health = 100;
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
});

function lockActionsForDuration(ms) {
  if (actionInProgress) return;
  actionInProgress = true;
  setButtonsDisabled(true);
  setTimeout(() => {
    actionInProgress = false;
    setButtonsDisabled(false);
  }, ms);
}

// --- Ball Show/Hide Logic ---
function showBallForDuration() {
  clearTimeout(showBallTimeout);
  clearTimeout(fadeBallTimeout);
  showBall = true;
  ballAlpha = 1;

  const imgIndex = Math.floor(Math.random() * ballImgObjects.length);
  const img = ballImgObjects[imgIndex];
  const margin = BALL_RADIUS + 5;
  const minX = margin;
  const maxX = canvas.width - margin;
  const minY = margin;
  const maxY = Math.floor(canvas.height / 2) - margin;
  const randX = minX + Math.random() * (maxX - minX);
  const randY = minY + Math.random() * (maxY - minY);
  const randVx = (Math.random() - 0.5) * 5;
  const randVy = (Math.random() - 0.2) * 3;

  ball = {
    x: randX,
    y: randY,
    vx: randVx,
    vy: randVy,
    radius: BALL_RADIUS,
    img: img,
    angle: 0,
  };

  showBallTimeout = setTimeout(() => {
    let fadeStart = Date.now();
    function fadeStep() {
      let elapsed = Date.now() - fadeStart;
      ballAlpha = Math.max(0, 1 - elapsed / 5000);
      if (ballAlpha > 0) {
        fadeBallTimeout = setTimeout(fadeStep, 16);
      } else {
        showBall = false;
        ballAlpha = 1;
        ball = null;
        pigAvoidingBall = false;
        justPausedAfterBall = true;
        ballGonePauseUntil = Date.now() + 2000;
      }
    }
    fadeStep();
  }, 10000);
}

// --- Sleep Sequence Logic ---
function runSleepSequence() {
  sleepSequenceStep = 1;
  sleepSequenceActive = true;
  sleepRequested = false;

  let imgA = resumeImg;
  let imgB = resumeImg === petImgRight ? petImgLeft : petImgRight;
  let sleepImg = resumeImg === petImgRight ? petImgSleepR : petImgSleep;

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
            currentImg = imgA;
            isSleeping = false;
            pendingWake = true;
            vx = 0;
            vy = 0;
            wakeTimeoutId = setTimeout(() => {
              pendingWake = false;
              sleepSequenceStep = 0;
              sleepSequenceActive = false;
              direction = resumeDirection;
              currentImg = direction === 1 ? petImgRight : petImgLeft;
            }, 2000);
          }, 5000);
        }, 500);
      }, 500);
    }, 500);
  }, 1000);
}

// --- v20 jump logic for idle movement ---
function startAutoJump() {
  const totalWidth = canvas.width - PET_WIDTH;
  const jumpCount = 5;
  const jumpDistance = totalWidth / jumpCount;
  const jumpDurationSeconds = 0.8;
  const fps = 60;
  const frames = jumpDurationSeconds * fps;

  let targetX;
  if (direction === 1) {
    targetX = Math.min(petX + jumpDistance, totalWidth);
  } else {
    targetX = Math.max(petX - jumpDistance, 0);
  }
  const dx = targetX - petX;

  vx = dx / frames;
  const jumpHeight = 32;
  vy = -Math.sqrt(2 * gravity * jumpHeight);

  currentImg = direction === 1 ? petImgRight : petImgLeft;
}

// --- Pig-ball overlap avoidance ---
function isPigOverlappingBall() {
  if (!showBall || !ball) return false;
  const pigLeft = petX;
  const pigRight = petX + PET_WIDTH;
  const pigTop = petY;
  const pigBottom = petY + PET_HEIGHT;
  const bx = ball.x, by = ball.y;
  return bx > pigLeft && bx < pigRight && by > pigTop && by < pigBottom;
}

// --- Ball physics, collision, etc ---
function kickBallFromPig(ball) {
  const baseSpeed = Math.max(Math.abs(vx), 4);
  const speed = (3 + Math.random() * 1.5) * baseSpeed;
  const dir = direction;
  if (Math.random() < 2 / 3) {
    const angle = Math.PI / 4 + Math.random() * (Math.PI / 12);
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = -speed * Math.sin(angle);
  } else {
    const angle = Math.random() * (Math.PI / 4);
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = -speed * Math.sin(angle);
  }
}

function ballBounceOnPigTop() {
  if (!showBall || !ball) return;
  const pigTopY = petY;
  const pigLeft = petX;
  const pigRight = petX + PET_WIDTH;
  const prevY = ball.y - ball.vy;
  const ballBottom = ball.y + BALL_RADIUS;
  if (
    ball.vy > 0 &&
    prevY + BALL_RADIUS <= pigTopY - 1 &&
    ballBottom >= pigTopY &&
    ball.x + BALL_RADIUS > pigLeft + 5 &&
    ball.x - BALL_RADIUS < pigRight - 5
  ) {
    ball.y = pigTopY - BALL_RADIUS;
    ball.vy *= -ballBounce;
    ball.vx += vx * 0.5;
    ball.vx *= 0.98;
  }
}

function pigHitsBallFront(ball) {
  const pigLeft = petX;
  const pigRight = petX + PET_WIDTH;
  const pigTop = petY;
  const pigBottom = petY + PET_HEIGHT;
  const bx = ball.x,
    by = ball.y,
    r = ball.radius;
  const closestX = Math.max(pigLeft, Math.min(bx, pigRight));
  const closestY = Math.max(pigTop, Math.min(by, pigBottom));
  const dx = bx - closestX;
  const dy = by - closestY;
  if (dx * dx + dy * dy < r * r) {
    if (direction === 1) {
      return bx > pigRight - r * 0.5 && bx < pigRight + r;
    } else {
      return bx < pigLeft + r * 0.5 && bx > pigLeft - r;
    }
  }
  return false;
}

// --- Animation/Background ---
function drawBackground() {
  ctx.fillStyle = '#90EE90';
  ctx.fillRect(0, getGroundY(), canvas.width, canvas.height - getGroundY());
  ctx.fillStyle = '#ADD8E6';
  ctx.fillRect(0, 0, canvas.width, getGroundY());
}

function updateBall() {
  if (!showBall || !ball) return;

  ball.vy += ballGravity;
  ball.vx *= ballAirFriction;
  ball.vy *= ballAirFriction;
  ballBounceOnPigTop();
  ball.x += ball.vx;
  ball.y += ball.vy;

  ball.angle += ball.vx / BALL_RADIUS;

  const pigGroundY = getGroundY();
  const ballRestY = pigGroundY + PET_HEIGHT - BALL_RADIUS;
  if (ball.y + BALL_RADIUS > ballRestY) {
    ball.y = ballRestY - BALL_RADIUS;
    ball.vy *= -ballBounce;
    if (Math.abs(ball.vy) < 1) ball.vy = 0;
  }

  if (ball.x - BALL_RADIUS < 0) {
    ball.x = BALL_RADIUS;
    ball.vx *= -ballBounce;
  }
  if (ball.x + BALL_RADIUS > canvas.width) {
    ball.x = canvas.width - BALL_RADIUS;
    ball.vx *= -ballBounce;
  }
}

function drawBall() {
  if (!showBall || !ball) return;
  ctx.save();
  ctx.globalAlpha = ballAlpha;
  if (ball.img) {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.angle || 0);
    ctx.drawImage(
      ball.img,
      -BALL_RADIUS,
      -BALL_RADIUS,
      BALL_DISPLAY_SIZE,
      BALL_DISPLAY_SIZE
    );
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// --- Pig Chasing Ball Logic ---
function updatePigChase() {
  if (isSleeping || sleepSequenceActive || pendingWake || !showBall || !ball) return;

  // --- Overlap protection ---
  if (pigAvoidingBall) {
    if (petY === getGroundY()) {
      direction = pigAvoidBallDirection;
      startAutoJump();
    }
    if (!isPigOverlappingBall()) {
      pigAvoidingBall = false;
    }
    return;
  } else if (isPigOverlappingBall()) {
    pigAvoidingBall = true;
    const pigCenter = petX + PET_WIDTH / 2;
    if (ball.x > pigCenter) {
      pigAvoidBallDirection = -1;
    } else {
      pigAvoidBallDirection = 1;
    }
    direction = pigAvoidBallDirection;
    if (petY === getGroundY()) {
      startAutoJump();
    }
    return;
  }

  const pigCenterX = petX + PET_WIDTH / 2;
  const ballX = ball.x;

  const chaseSpeed = 3 * 0.4;
  const deadzone = BALL_RADIUS + 10;
  if (Math.abs(ballX - pigCenterX) > deadzone) {
    if (ballX > pigCenterX) {
      direction = 1;
      vx = chaseSpeed;
      currentImg = petImgRight;
    } else {
      direction = -1;
      vx = -chaseSpeed;
      currentImg = petImgLeft;
    }
  } else {
    vx = 0;
    if (direction === 1) currentImg = petImgRight;
    else currentImg = petImgLeft;
  }
}

// --- Animate loop ---
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();

  updateBall();
  drawBall();

  // --- Ball gone pause logic ---
  if (justPausedAfterBall) {
    vx = 0;
    vy = 0;
    petY = getGroundY();
    if (Date.now() >= ballGonePauseUntil) {
      justPausedAfterBall = false;
      // Robust wall bounce: ensure not at wall after pause
      const totalWidth = canvas.width - PET_WIDTH;
      if (petX <= 0) {
        petX = 0;
        direction = 1;
        startAutoJump();
      } else if (petX >= totalWidth) {
        petX = totalWidth;
        direction = -1;
        startAutoJump();
      } else {
        startAutoJump();
      }
    }
    ctx.drawImage(currentImg, petX, petY, PET_WIDTH, PET_HEIGHT);
    requestAnimationFrame(animate);
    return;
  }

  // --- IDLE: pig bounces left/right ---
  if (!showBall || !ball) {
    if (!isSleeping && !sleepSequenceActive && !pendingWake) {
      vy += gravity;
      petX += vx;
      petY += vy;

      const totalWidth = canvas.width - PET_WIDTH;
      let groundY = getGroundY();

      if (petY >= groundY) {
        petY = groundY;
        vy = 0;

        if (petX <= 0) {
          petX = 0;
          direction = 1;
          startAutoJump();
        } else if (petX >= totalWidth) {
          petX = totalWidth;
          direction = -1;
          startAutoJump();
        } else {
          startAutoJump();
        }

        // Sleep should start immediately if pending
        if (pendingSleep) {
          vx = 0;
          vy = 0;
          pendingSleep = false;
          runSleepSequence();
        }
      }
    }
  } else {
    // --- CHASE: use advanced chase logic ---
    updatePigChase();
    if (!isSleeping && !sleepSequenceActive && !pendingWake) {
      vy += gravity;
      petX += vx;
      petY += vy;
    }
    if (!isSleeping && !sleepSequenceActive && !pendingWake) {
      const totalWidth = canvas.width - PET_WIDTH;
      if (petX <= 0) {
        petX = 0;
        direction = 1;
        startAutoJump();
      } else if (petX + PET_WIDTH >= canvas.width) {
        petX = canvas.width - PET_WIDTH;
        direction = -1;
        startAutoJump();
      }
    }
    if (!isSleeping && !sleepSequenceActive && !pendingWake && showBall && ball) {
      if (pigHitsBallFront(ball)) {
        kickBallFromPig(ball);
      }
    }
    let groundY = getGroundY();
    if (petY >= groundY) {
      petY = groundY;
      if (pendingSleep) {
        vx = 0;
        vy = 0;
        pendingSleep = false;
        runSleepSequence();
      } else if (!isSleeping && !sleepSequenceActive && !sleepRequested && !pendingWake) {
        startAutoJump();
      }
    }
  }

  ctx.drawImage(currentImg, petX, petY, PET_WIDTH, PET_HEIGHT);

  requestAnimationFrame(animate);
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

      // Ensure pig starts away from wall and with correct direction
      const totalWidth = canvas.width - PET_WIDTH;
      if (petX <= 0) {
        petX = 0;
        direction = 1;
      } else if (petX >= totalWidth) {
        petX = totalWidth;
        direction = -1;
      }

      startAutoJump();
      animate();
    })
    .catch((err) => {
      console.error("One or more images failed to load.", err);
    });
});
