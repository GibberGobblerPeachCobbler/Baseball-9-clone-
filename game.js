// Baseball Nine v4 — MLB x Doodle Edition
// Camera behind batter perspective, full game mode, auto-pitcher, polished feel.
// No external assets. All procedural art and sounds.

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const resetBtn = document.getElementById('reset');
const hitBtn = document.getElementById('hit');
const modeSel = document.getElementById('mode');
const logEl = document.getElementById('game-log');
const scoreEl = document.getElementById('score');
const inningEl = document.getElementById('inning');
const outsEl = document.getElementById('outs');
const strikesEl = document.getElementById('strikes');

const stick = document.getElementById('stick');
const stickBase = document.getElementById('stickBase');

const W = canvas.width = 1200, H = canvas.height = 700;
let game = null;
let audioCtx = null;

function ensureAudio(){ if(audioCtx) return audioCtx; audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
function beep(f, t=0.06, vol=0.08){ const ac=ensureAudio(); const o=ac.createOscillator(); const g=ac.createGain(); o.frequency.value=f; o.type='sine'; g.gain.value=vol; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+t); }
function hitSound(power){ const ac=ensureAudio(); const o=ac.createOscillator(); const g=ac.createGain(); o.type='sawtooth'; o.frequency.value=220+power*600; g.gain.value=0.12; o.connect(g); g.connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.28); o.stop(ac.currentTime+0.3); }
function swingSound(){ const ac=ensureAudio(); const o=ac.createOscillator(); const g=ac.createGain(); o.type='square'; o.frequency.setValueAtTime(380, ac.currentTime); o.frequency.exponentialRampToValueAtTime(1100, ac.currentTime+0.08); g.gain.setValueAtTime(0.12, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.12); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+0.13); }
function cheer(){ beep(700,0.07,0.08); setTimeout(()=>beep(880,0.09,0.08),90); setTimeout(()=>beep(1020,0.12,0.09),180); }

// Logging
function log(msg){ const d=document.createElement('div'); d.textContent=msg; logEl.prepend(d); }

// Utility
function rand(a,b){ return Math.random()*(b-a)+a; }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function easeOutQuad(t){ return 1 - (1 - t)*(1 - t); }

// World coordinates: use a top-down diamond with "depth" (z) toward pitcher
// We'll simulate camera behind batter: nearer objects (home plate area) are larger; pitcher is far and small.
// We'll represent bases in world coords (x,z) where z is depth from home toward pitcher.

const world = {
  width: 200, // lateral width in world units
  depth: 300  // distance from home to outfield in world units
};

// convert world (x,z) to screen coordinates with simple perspective
function project(x,z){
  // center X at canvas center, z=0 at home, z=depth at pitcher/outfield
  const cx = W*0.5;
  const baseScale = 0.0016; // scale per depth
  const scale = 1 - (z / (world.depth*1.4)); // further away => smaller
  const screenX = cx + (x - 0) * (600/ world.width) * scale;
  const screenY = H*0.78 - z * 0.9; // compress z to y: increase z moves upward
  return {x: screenX, y: screenY, s: scale};
}

// Base world positions (x,z)
const basesWorld = {
  home: {x:0, z:0},
  first: {x:80, z:80},
  second: {x:0, z:160},
  third: {x:-80, z:80}
};

// --- Game class ---
class Game {
  constructor(){
    this.reset();
  }
  reset(){
    this.inning = 1;
    this.top = true;
    this.score = [0,0];
    this.outs = 0;
    this.strikes = 0;
    this.bases = [null, null, null]; // 1st,2nd,3rd runners (objects)
    this.mode = 'game';
    this.state = 'idle'; // idle, pitched, ballInPlay, resolving
    this.ball = null;
    this.pitcher = {x: basesWorld.second.x, z: world.depth, bob:0};
    this.fielders = this.makeFielders();
    this.batCursor = {x: basesWorld.home.x, z: 10}; // small z near home; bat cursor moves along x,z plane near plate
    this.pitchTimer = 0;
    this.autoPitchInterval = 1500;
    this.updateHUD();
    log('Ready. Click Start to play. Pitcher will pitch automatically.');
  }
  makeFielders(){
    // assign fielders to approximate infield positions (world coords)
    return [
      {name:'P', x:basesWorld.second.x, z: world.depth - 10},
      {name:'C', x:basesWorld.home.x, z: 8},
      {name:'1B', x:basesWorld.first.x, z: basesWorld.first.z},
      {name:'2B', x:basesWorld.second.x, z: basesWorld.second.z},
      {name:'3B', x:basesWorld.third.x, z: basesWorld.third.z},
      {name:'SS', x:basesWorld.second.x - 30, z: 70}
    ];
  }
  updateHUD(){
    scoreEl.textContent = `${this.score[0]} - ${this.score[1]}`;
    inningEl.textContent = `Inning: ${this.inning} (${this.top? 'Top' : 'Bot'})`;
    outsEl.textContent = `Outs: ${this.outs}`;
    strikesEl.textContent = `Strikes: ${this.strikes}`;
  }
  start(mode){
    this.mode = mode || 'game';
    this.outs = 0; this.strikes = 0; this.bases = [null,null,null];
    this.state = 'idle';
    this.ball = null;
    this.fielders = this.makeFielders();
    this.scheduleAutoPitch();
    this.updateHUD();
    log(`Started ${this.mode==='hr'?'Home Run Derby':'Full Game'}.`);
  }
  scheduleAutoPitch(){
    if(this._autoPitchTimer) clearInterval(this._autoPitchTimer);
    this._autoPitchTimer = setInterval(()=>{
      if(this.state === 'idle' || this.state === 'readyForPitch' || this.state === 'waiting'){
        this.cpuPitch();
      }
    }, this.autoPitchInterval + rand(-300, 500));
  }
  stopAutoPitch(){
    if(this._autoPitchTimer) clearInterval(this._autoPitchTimer);
    this._autoPitchTimer = null;
  }
  cpuPitch(){
    if(this.state === 'pitched' || this.state === 'ballInPlay') return;
    this.state = 'pitched';
    // target X in world coords (near plate)
    const tx = rand(-25, 25);
    const tz = 12; // near home plate z
    const speed = this.mode==='hr'? rand(5.5,8) : rand(6.8,10.5);
    // ball world position and velocity (vx in world x units per tick, vz in world z units per tick)
    const vz = -(world.depth - tz) / speed; // negative because z decreases toward home
    const vx = (tx - this.pitcher.x) / speed;
    this.ball = {x: this.pitcher.x, z: this.pitcher.z || world.depth, vx, vz, radius:7, thrown:true};
    beep(420, 0.05, 0.07);
    log('Pitcher throws.');
  }
  playerHit(){
    if(this.state !== 'pitched' || !this.ball) return;
    // compute where bat cursor is relative to ball (project both to screen for easiest timing)
    const ballScreen = project(this.ball.x, Math.max(0, this.ball.z));
    const cursorScreen = project(this.batCursor.x, Math.max(0, this.batCursor.z || 10));
    const dx = ballScreen.x - cursorScreen.x;
    const dy = ballScreen.y - cursorScreen.y;
    const dist = Math.hypot(dx, dy);
    const quality = clamp(1 - (dist / 70), 0, 1);
    swingSound();
    if(quality < 0.18 || Math.random() > 0.995){
      // foul if ball near edges of plate in world x
      const fair = (this.ball.x > -90 && this.ball.x < 90);
      if(!fair){
        if(this.strikes < 2) this.strikes++;
        log('Foul! Pitcher will throw again.');
        this.state = 'readyForPitch';
        this.ball = null;
        this.updateHUD();
        return;
      } else {
        this.strikes++;
        log('Swing and miss — strike.');
        if(this.strikes >= 3){
          this.outs++;
          this.strikes = 0;
          log('Strikeout!');
          if(this.checkEndHalf()) return;
        }
        this.state = 'readyForPitch';
        this.ball = null;
        this.updateHUD();
        return;
      }
    }
    // Hit succeeded
    const power = clamp(quality + rand(-0.05, 0.12), 0.12, 1);
    hitSound(power);
    // convert hit to world velocities: send ball away from home (positive z)
    const angle = rand(-0.4, 0.4);
    const speed = 4 + power * 10;
    // world vx and vz
    this.ball.vx = Math.sin(angle) * speed * 1.2;
    this.ball.vz = speed * 1.8; // positive to go away from home
    this.ball.thrown = false;
    this.state = 'ballInPlay';
    // create batter-runner
    const runner = {base:0, x: basesWorld.home.x, z: 4, speed: 0.9 + power*0.9, desiredBases: power>0.86?4: power>0.56?2:1};
    this.bases.unshift(runner);
    log('Ball in play!');
  }
  update(dt){
    // dt is approx frame fraction; move ball and fielders in world coords
    if(this.ball && this.ball.thrown && this.state === 'pitched'){
      // advance pitch in world coords
      this.ball.x += this.ball.vx;
      this.ball.z += this.ball.vz;
      // intercept near plate: if z <= 10 then pitch is at plate
      if(this.ball.z <= 10){
        // if no swing (state still pitched) treat as called strike or ball
        if(this.ball.x > -35 && this.ball.x < 35){
          this.strikes++;
          log('Called strike.');
          if(this.strikes >= 3){
            this.outs++;
            this.strikes = 0;
            log('Strikeout!');
            if(this.checkEndHalf()) return;
          }
        } else {
          log('Ball. Pitcher to pitch again.');
        }
        this.ball = null;
        this.state = 'readyForPitch';
      }
    }
    if(this.ball && !this.ball.thrown && this.state === 'ballInPlay'){
      // move batted ball outward (increasing z), and x laterally
      this.ball.x += this.ball.vx;
      this.ball.z += this.ball.vz;
      // simple gravity-like arc: decrease vz over time to simulate arc (so it can land)
      this.ball.vz *= 0.995;
      // if ball goes far (home run)
      if(this.ball.z > world.depth + 60 || Math.abs(this.ball.x) > world.width*1.4){
        // homerun: award runs for batter + any occupied bases
        const runs = 1 + this.bases.slice(1).filter(b=>b).length;
        this.score[this.top?0:1] += runs;
        cheer();
        log(`Home run! ${runs} run(s).`);
        this.bases = [null,null,null];
        this.ball = null;
        this.state = 'readyForPitch';
        this.updateHUD();
        return;
      }
      // if ball drops into field (z less than some threshold simulate ground contact)
      if(this.ball.z > 60){
        // find nearest fielder in world coordinates
        const f = this.findNearestFielder(this.ball.x, this.ball.z);
        // move fielder toward ball
        const dx = this.ball.x - f.x;
        const dz = this.ball.z - f.z;
        const dist = Math.hypot(dx, dz);
        const speed = 2.4;
        if(dist > 6){
          f.x += dx/dist * speed;
          f.z += dz/dist * speed;
        } else {
          // fielder reached ball
          const success = Math.random() < 0.77;
          if(success){
            this.outs++;
            log(`${f.name} fields and records an out!`);
            // remove batter-runner if present
            if(this.bases[0]) this.bases.shift();
            if(this.checkEndHalf()) return;
          } else {
            log(`${f.name} couldn't make the play; runners advance.`);
            for(const r of this.bases){
              if(r) r.base += Math.min(1, r.desiredBases);
            }
            this.scoreRuns();
          }
          this.ball = null;
          this.state = 'readyForPitch';
        }
      }
      // foul detection: if ball x out of lateral fair range while near home area -> foul
      if(this.ball && (this.ball.x < -world.width*0.4 || this.ball.x > world.width*0.4) && this.ball.z < 80){
        log('Foul ball!');
        if(this.strikes < 2) this.strikes++;
        // remove batter placeholder
        if(this.bases[0]) this.bases.shift();
        this.ball = null;
        this.state = 'readyForPitch';
        this.updateHUD();
        return;
      }
      // advance runners gradually
      for(const r of this.bases){
        if(!r) continue;
        const target = this.baseWorldCoords(r.base+1);
        r.x += (target.x - r.x) * 0.06 * r.speed;
        r.z += (target.z - r.z) * 0.06 * r.speed;
        if(r.base >= 4){
          this.score[this.top?0:1] += 1;
          log('Run scored!');
          cheer();
          const idx = this.bases.indexOf(r);
          if(idx !== -1) this.bases[idx] = null;
        }
      }
    }
    this.updateHUD();
  }
  baseWorldCoords(n){
    if(n<=0) return {x: basesWorld.home.x, z: 4};
    if(n===1) return {x: basesWorld.first.x, z: basesWorld.first.z};
    if(n===2) return {x: basesWorld.second.x, z: basesWorld.second.z};
    if(n===3) return {x: basesWorld.third.x, z: basesWorld.third.z};
    return {x: basesWorld.home.x, z: 4};
  }
  findNearestFielder(x,z){
    let best = this.fielders[0], bestD = Infinity;
    for(const f of this.fielders){
      const d = Math.hypot(f.x - x, f.z - z);
      if(d < bestD){ best = f; bestD = d; }
    }
    return best;
  }
  scoreRuns(){
    for(let i=0;i<this.bases.length;i++){
      const r = this.bases[i];
      if(!r) continue;
      if(r.base >= 4){
        this.score[this.top?0:1] += 1;
        this.bases[i] = null;
      }
    }
    this.updateHUD();
  }
  checkEndHalf(){
    if(this.outs >= 3){
      log(`Three outs — ${this.top? 'Top' : 'Bottom'} of ${this.inning} ends.`);
      this.outs = 0;
      this.strikes = 0;
      this.top = !this.top;
      if(this.top) this.inning++;
      this.bases = [null,null,null];
      this.state = 'waiting';
      return true;
    }
    return false;
  }
  stop(){
    this.stopAutoPitch();
  }
  stopAutoPitch(){
    if(this._autoPitchTimer) clearInterval(this._autoPitchTimer);
    this._autoPitchTimer = null;
  }
}

// --- Drawing: behind-batter perspective, realistic diamond ---
function drawScene(g){
  // clear
  ctx.clearRect(0,0,W,H);
  // sky
  const sky = ctx.createLinearGradient(0,0,0,H*0.3);
  sky.addColorStop(0, '#bfe6ff'); sky.addColorStop(1,'#eaf6ff');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H*0.3);
  // crowd band - simple doodle style
  ctx.fillStyle = '#f4c36a';
  ctx.fillRect(0,H*0.3,W,22);

  // grass area
  ctx.fillStyle = '#7ad264';
  ctx.fillRect(0,H*0.32,W,H*0.68);

  // draw infield as diamond projected
  // draw baselines: project world base coords to screen
  const home = project(basesWorld.home.x, basesWorld.home.z);
  const first = project(basesWorld.first.x, basesWorld.first.z);
  const second = project(basesWorld.second.x, basesWorld.second.z);
  const third = project(basesWorld.third.x, basesWorld.third.z);

  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(home.x, home.y);
  ctx.lineTo(first.x, first.y);
  ctx.lineTo(second.x, second.y);
  ctx.lineTo(third.x, third.y);
  ctx.closePath();
  ctx.stroke();

  // draw dirt infield (simple filled polygon)
  ctx.fillStyle = '#e2b98a';
  ctx.beginPath();
  ctx.moveTo(home.x, home.y);
  ctx.lineTo(first.x, first.y);
  ctx.lineTo(second.x, second.y);
  ctx.lineTo(third.x, third.y);
  ctx.closePath();
  ctx.fill();

  // draw bases as rotated squares at projected positions (no weird shapes)
  function drawBase(bw){
    const p = project(bw.x, bw.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI/4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-12, -12, 24, 24);
    ctx.restore();
  }
  drawBase(basesWorld.home); drawBase(basesWorld.first); drawBase(basesWorld.second); drawBase(basesWorld.third);

  // draw pitcher (small in distance) and catcher near home
  // pitcher
  const pitchP = project(game.pitcher.x, game.pitcher.z || world.depth);
  drawDoodlePlayer(pitchP.x, pitchP.y, 0.6, 'P');
  // catcher
  const catchP = project(basesWorld.home.x, 8);
  drawDoodlePlayer(catchP.x, catchP.y, 0.95, 'C');

  // draw fielders
  for(const f of game.fielders){
    const p = project(f.x, f.z);
    drawDoodlePlayer(p.x, p.y, 0.9, f.name);
  }

  // draw runners (projected)
  for(const r of game.bases){
    if(!r) continue;
    const p = project(r.x, r.z);
    ctx.fillStyle = '#ff8a65';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 10 * p.s, 12 * p.s, 0, 0, Math.PI*2); ctx.fill();
    // helmet
    ctx.fillStyle = '#06325b';
    ctx.fillRect(p.x - 6*p.s, p.y - 14*p.s, 12*p.s, 5*p.s);
  }

  // draw bat cursor (contact dot) — project its screen coords
  const c = project(game.batCursor.x, game.batCursor.z || 10);
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 8;
  ctx.arc(c.x, c.y, 12 * c.s, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#06325b';
  ctx.font = `${12 * c.s}px sans-serif`;
  ctx.fillText('BAT', c.x - 16 * c.s, c.y + 4 * c.s);
  ctx.restore();

  // draw ball if exists
  if(game.ball){
    const b = project(game.ball.x, game.ball.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, game.ball.radius * b.s, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 2 * b.s; ctx.stroke();
  }

  // HUD: subtle bottom overlay for controls
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fillRect(0, H - 80, W, 80);
}

// draw simple doodle-style player at screen coords with scale and label
function drawDoodlePlayer(sx, sy, scale=1, label=''){
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale, scale);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.ellipse(0, 18, 18, 8, 0, 0, Math.PI*2); ctx.fill();
  // body
  ctx.fillStyle = '#0b3d91';
  roundRect(ctx, -12, -20, 24, 28, 8, true, false);
  // head
  ctx.fillStyle = '#ffd9b8';
  ctx.beginPath(); ctx.ellipse(0, -12, 8, 9, 0, 0, Math.PI*2); ctx.fill();
  // eyes
  ctx.fillStyle = '#000'; ctx.fillRect(-3, -14, 2, 2); ctx.fillRect(2, -14, 2, 2);
  // label
  ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.fillText(label, -8, 6);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if(typeof r === 'undefined') r = 6;
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if(fill) ctx.fill();
  if(stroke){ ctx.strokeStyle='rgba(0,0,0,0.05)'; ctx.stroke(); }
}

// --- Main loop ---
let last = 0;
function loop(t){
  const dt = (t - last)/16.666; last = t;
  if(game) game.update(dt);
  drawScene(game);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Input: joystick & hit button placement ---
// joystick controls adjust batCursor.x within world lateral range and small z range near plate
let baseRect = stickBase.getBoundingClientRect();
function updateBaseRect(){ baseRect = stickBase.getBoundingClientRect(); }
window.addEventListener('resize', updateBaseRect);
let vx = 0, vz = 0;
function stickMove(px, py){
  const cx = baseRect.left + baseRect.width/2;
  const cy = baseRect.top + baseRect.height/2;
  const dx = px - cx, dy = py - cy;
  const max = baseRect.width/2 - 14;
  const ndx = clamp(dx, -max, max);
  const ndy = clamp(dy, -max, max);
  stick.style.transform = `translate(${ndx}px, ${ndy}px)`;
  const nx = ndx / max; const ny = ndy / max;
  // map to world motion: nx -> lateral x, ny -> small z forward/back near plate
  vx = nx * 4.5;
  vz = -ny * 3.2; // negative because pushing up moves toward pitcher slightly
}
stick.addEventListener('pointerdown', (e)=>{ stick.setPointerCapture(e.pointerId); updateBaseRect(); stickMove(e.clientX, e.clientY); });
window.addEventListener('pointermove', (e)=>{ if(e.pointerType==='mouse' && e.buttons===0) return; if(e.clientX) stickMove(e.clientX, e.clientY); });
window.addEventListener('pointerup', (e)=>{ stick.style.transform='translate(0,0)'; vx=0; vz=0; });

window.addEventListener('keydown', (e)=>{
  if(e.code === 'ArrowLeft') vx = -4.5;
  if(e.code === 'ArrowRight') vx = 4.5;
  if(e.code === 'ArrowUp') vz = -3.2;
  if(e.code === 'ArrowDown') vz = 3.2;
  if(e.code === 'Space') hitBtn.click();
});
window.addEventListener('keyup', (e)=>{
  if(e.code.startsWith('Arrow')){ vx=0; vz=0; }
});

// bat cursor movement tick
setInterval(()=>{ if(game){ game.batCursor.x = clamp(game.batCursor.x + vx, -world.width*0.45, world.width*0.45); game.batCursor.z = clamp((game.batCursor.z || 8) + vz, 4, 30); } }, 20);

// --- UI wiring ---
startBtn.addEventListener('click', ()=>{
  if(!game) game = new Game();
  game.start(modeSel.value);
  startBtn.disabled = true;
});
resetBtn.addEventListener('click', ()=>{
  if(game) game.stop();
  game = new Game();
  startBtn.disabled = false;
  logEl.innerHTML = '';
});
hitBtn.addEventListener('click', ()=>{
  if(!game) return;
  game.playerHit();
});

// initialize
game = new Game();
