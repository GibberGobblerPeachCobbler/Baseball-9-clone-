// Baseball Nine v3 - Doodle-style detailed 2.5D, auto-pitcher, procedural sounds.
// No external assets. All drawing is procedural to give a "doodle" but distinct look.

const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const hitBtn = document.getElementById('hit');
const resetBtn = document.getElementById('reset');
const logEl = document.getElementById('log');
const scoreEl = document.getElementById('score');
const inningEl = document.getElementById('inning');
const outsEl = document.getElementById('outs');
const strikesEl = document.getElementById('strikes');
const modeSel = document.getElementById('mode');

const stick = document.getElementById('stick');
const stickBase = document.getElementById('stickBase');

const W = canvas.width, H = canvas.height;
let game = null;
let audioCtx = null;

// --- Simple audio helpers (WebAudio) ---
function ensureAudio(){
  if(audioCtx) return audioCtx;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playBeep(freq, type='sine', time=0.05, gain=0.15){
  const ac = ensureAudio();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g); g.connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + time);
}
function playSwing(){
  // short noise burst with pitch sweep
  const ac = ensureAudio();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(400, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.08);
  g.gain.setValueAtTime(0.12, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + 0.13);
}
function playHit(power){
  const ac = ensureAudio();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sawtooth';
  o.frequency.value = 200 + power*600;
  g.gain.value = 0.18;
  o.connect(g); g.connect(ac.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
  o.stop(ac.currentTime + 0.26);
}
function playCrowd(score){
  // quick sequence to sound rewarding
  playBeep(600, 'sine', 0.07, 0.12);
  setTimeout(()=>playBeep(850,'sine',0.09,0.12),80);
  setTimeout(()=>playBeep(1100,'sine',0.12,0.14),180);
}

// --- Logging ---
function log(s){
  const d = document.createElement('div'); d.textContent = s;
  logEl.prepend(d);
}

// --- Utilities ---
function rand(a,b){ return Math.random()*(b-a)+a }
function clamp(x,a,b){ return Math.max(a,Math.min(b,x)) }

// --- Game ---
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
    this.bases = [null,null,null]; // 1st,2nd,3rd
    this.mode = 'game';
    this.state = 'idle'; // idle, pitched, ballInPlay, resolving
    this.ball = null;
    this.pitcher = {x: W*0.5, y: H*0.18, bob:0};
    this.fielders = this.makeFielders();
    this.batCursor = {x: W*0.5, y: H*0.82};
    this.pitchInterval = null;
    this.pitchDelay = 1600; // ms between automatic pitches (will vary)
    this.updateHUD();
    log('Ready. Click Start to play. Pitcher will pitch automatically when game starts.');
  }
  makeFielders(){
    return [
      {name:'P', x:W*0.5, y:H*0.24},
      {name:'C', x:W*0.5, y:H*0.82},
      {name:'1B', x:W*0.82, y:H*0.62},
      {name:'2B', x:W*0.56, y:H*0.42},
      {name:'3B', x:W*0.18, y:H*0.62},
      {name:'SS', x:W*0.38, y:H*0.48}
    ];
  }
  updateHUD(){
    scoreEl.textContent = `${this.score[0]} - ${this.score[1]}`;
    inningEl.textContent = `Inning: ${this.inning} (${this.top?'Top':'Bot'})`;
    outsEl.textContent = `Outs: ${this.outs}`;
    strikesEl.textContent = `Strikes: ${this.strikes}`;
  }
  start(mode){
    this.mode = mode || 'game';
    this.outs = 0; this.strikes = 0; this.bases = [null,null,null];
    this.state = 'idle';
    this.ball = null;
    this.fielders = this.makeFielders();
    this.updateHUD();
    this.scheduleAutoPitch();
    log(`Game started (${this.mode==='hr'?'Home Run Derby':'Full Game'}).`);
  }
  scheduleAutoPitch(){
    // clear previous
    if(this.pitchInterval) clearInterval(this.pitchInterval);
    // start automatic pitching with some randomness
    this.pitchInterval = setInterval(()=>{
      if(this.state === 'idle' || this.state === 'readyForPitch' || this.state === 'waiting'){
        this.cpuPitch();
      }
    }, this.pitchDelay + rand(-400,400));
  }
  stopAutoPitch(){
    if(this.pitchInterval) clearInterval(this.pitchInterval);
    this.pitchInterval = null;
  }
  cpuPitch(){
    if(this.state === 'pitched' || this.state === 'ballInPlay') return;
    // pitch animation: bob pitcher and throw
    this.state = 'pitched';
    this.pitcher.bob = 0;
    // pitch target and speed
    const targetX = rand(W*0.37, W*0.63);
    const speed = this.mode==='hr'? rand(5.5,8) : rand(6,10);
    this.ball = {x:this.pitcher.x, y:this.pitcher.y, vx:(targetX - this.pitcher.x)/speed, vy:(H*0.82 - this.pitcher.y)/speed, radius:9, thrown:true};
    playBeep(420, 'sine', 0.05, 0.06); // windup sound
    // small chance of trick pitch (faster)
    if(Math.random() < 0.08) { this.ball.vx *= 1.2; this.ball.vy *= 1.25; }
    log('Pitch delivered.');
  }
  playerHit(){
    if(this.state !== 'pitched') return;
    if(!this.ball) return;
    // compute proximity: how close batCursor is to ball when swing occurs
    const dx = this.ball.x - this.batCursor.x;
    const dy = this.ball.y - this.batCursor.y;
    const dist = Math.hypot(dx,dy);
    const quality = clamp(1 - (dist / 60), 0, 1); // 0..1
    playSwing();
    // small randomness
    const rng = Math.random();
    // if very poor contact -> miss or foul
    if(quality < 0.18 || rng > 0.99){
      // check if it's near foul area -> foul
      if(this.ball.x < W*0.24 || this.ball.x > W*0.76){
        // foul counts as strike unless already 2 strikes
        if(this.strikes < 2) this.strikes++;
        log('Foul ball! Pitcher will pitch again.');
        this.state = 'readyForPitch';
        this.ball = null;
        this.updateHUD();
        return;
      } else {
        // swing and miss -> strike
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
    // good contact -> compute power and flight
    const power = clamp(quality + rand(-0.05, 0.12), 0.12, 1);
    playHit(power);
    const angle = rand(-0.55, 0.55);
    this.ball.vx = Math.cos(angle) * (4 + power*9);
    this.ball.vy = -Math.abs(Math.sin(angle)) * (2 + power*5);
    this.ball.thrown = false;
    this.state = 'ballInPlay';
    // create runner
    const runner = {base:0, x:W*0.5, y:H*0.82, speed:1.2 + power*0.9, desiredBases: power>0.86?4: power>0.56?2:1};
    // insert runner as batter (at front)
    this.bases.unshift(runner);
    log('Ball hit into play!');
  }
  update(dt){
    // animate pitcher slight bob
    this.pitcher.bob += 0.06;
    this.pitcher.y += Math.sin(this.pitcher.bob) * 0.02;
    // move ball if exists
    if(this.ball && this.ball.thrown && this.state === 'pitched'){
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      this.ball.vy += 0.08; // gravity
      // if past plate region and no swing -> called strike or ball
      if(this.ball.y > H*0.8){
        // determine strike zone
        if(this.ball.x > W*0.36 && this.ball.x < W*0.64){
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
    // ball in play physics
    if(this.ball && !this.ball.thrown && this.state === 'ballInPlay'){
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      this.ball.vy += 0.22;
      // bounce
      if(this.ball.y > H*0.86){
        this.ball.y = H*0.86;
        this.ball.vy *= -0.28;
        this.ball.vx *= 0.94;
      }
      // if out-of-bounds far away -> homer
      if(this.ball.x < -120 || this.ball.x > W+120 || this.ball.y < -120){
        const runs = 1 + this.bases.slice(1).filter(b=>b).length;
        this.score[this.top?0:1] += runs;
        playCrowd();
        log(`Over the fence! ${runs} run(s).`);
        this.bases = [null,null,null];
        this.ball = null;
        this.state = 'readyForPitch';
        this.updateHUD();
        return;
      }
      // if ball on ground: nearest fielder chases
      if(this.ball.y >= H*0.5){
        const f = this.findNearestFielder(this.ball.x, this.ball.y);
        const dx = this.ball.x - f.x, dy = this.ball.y - f.y;
        const dist = Math.hypot(dx,dy);
        const speed = 2.2;
        if(dist > 6){
          f.x += dx/dist * speed;
          f.y += dy/dist * speed;
        } else {
          // fielder reaches ball
          const success = Math.random() < 0.78;
          if(success){
            this.outs++;
            log(`${f.name} fields the ball and records an out!`);
            // remove lead runner (batter) if present
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
      // foul detection while ball moving and near infield edges
      if(this.ball && (this.ball.x < W*0.24 || this.ball.x > W*0.76) && this.ball.y > H*0.5){
        log('Foul ball!');
        if(this.strikes < 2) this.strikes++;
        // remove batter placeholder
        if(this.bases[0]) this.bases.shift();
        this.ball = null;
        this.state = 'readyForPitch';
        this.updateHUD();
        return;
      }
      // move runners
      for(const r of this.bases){
        if(!r) continue;
        const target = this.baseCoords(r.base+1);
        r.x += (target.x - r.x) * 0.06 * r.speed;
        r.y += (target.y - r.y) * 0.06 * r.speed;
        if(r.base >= 4){
          this.score[this.top?0:1] += 1;
          log('Run scored!');
          playCrowd();
          const idx = this.bases.indexOf(r);
          if(idx !== -1) this.bases[idx] = null;
        }
      }
    }
    this.updateHUD();
  }
  baseCoords(n){
    if(n<=0) return {x:W*0.5, y:H*0.82};
    if(n===1) return {x:W*0.82, y:H*0.62};
    if(n===2) return {x:W*0.56, y:H*0.42};
    if(n===3) return {x:W*0.18, y:H*0.62};
    return {x:W*0.5, y:H*0.82};
  }
  findNearestFielder(x,y){
    let best = this.fielders[0], bestD = Infinity;
    for(const f of this.fielders){
      const d = Math.hypot(f.x - x, f.y - y);
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
    if(this.pitchInterval) clearInterval(this.pitchInterval);
    this.pitchInterval = null;
  }
}

// --- Drawing helpers for doodle-style characters ---
function drawField(g){
  // background sky gradient
  ctx.clearRect(0,0,W,H);
  const sky = ctx.createLinearGradient(0,0,0,H*0.35);
  sky.addColorStop(0,'#bfe1ff'); sky.addColorStop(1,'#e6f2ff');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H*0.35);
  // distant crowd band
  ctx.fillStyle = '#f4c36a';
  ctx.fillRect(0,H*0.35,W,20);
  // grass
  ctx.fillStyle = '#72c462';
  ctx.fillRect(0,H*0.35,W,H*0.65);
  // infield dirt shape (rounded diamond)
  ctx.beginPath();
  ctx.moveTo(W*0.5, H*0.82);
  ctx.quadraticCurveTo(W*0.77,H*0.64, W*0.52,H*0.44);
  ctx.quadraticCurveTo(W*0.28,H*0.64, W*0.5,H*0.82);
  ctx.fillStyle = '#e2b98a';
  ctx.fill();
  // white chalk lines and batter box doodle
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W*0.5,H*0.82);
  ctx.lineTo(W*0.82,H*0.62);
  ctx.moveTo(W*0.5,H*0.82);
  ctx.lineTo(W*0.56,H*0.42);
  ctx.moveTo(W*0.5,H*0.82);
  ctx.lineTo(W*0.18,H*0.62);
  ctx.stroke();
  // bases
  const bases = [
    {x:W*0.5,y:H*0.82},
    {x:W*0.82,y:H*0.62},
    {x:W*0.56,y:H*0.42},
    {x:W*0.18,y:H*0.62}
  ];
  for(const b of bases){
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.translate(b.x,b.y);
    ctx.rotate(Math.PI/4);
    ctx.fillRect(-12,-12,24,24);
    ctx.restore();
  }
  // draw pitcher mound stylized
  ctx.fillStyle = '#d9a36f';
  ctx.beginPath();
  ctx.ellipse(W*0.5, H*0.22, 34, 12, 0, 0, Math.PI*2);
  ctx.fill();
  // draw fielders with doodle-style (oval body + simple limbs)
  for(const f of g.fielders){
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(f.x, f.y+14, 18,8,0,0,Math.PI*2); ctx.fill();
    // body
    ctx.fillStyle = '#0b3d91';
    roundRect(ctx, f.x-14, f.y-20, 28, 32, 8, true, false);
    // head
    ctx.fillStyle = '#ffd9b8';
    ctx.beginPath(); ctx.ellipse(f.x, f.y-14, 9,10,0,0,Math.PI*2); ctx.fill();
    // eyes
    ctx.fillStyle = '#000'; ctx.fillRect(f.x-3, f.y-16, 2,2); ctx.fillRect(f.x+2, f.y-16, 2,2);
    // name tag
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(f.name, f.x-12, f.y+6);
  }
  // draw bat cursor with slight 3D shading
  ctx.save();
  ctx.beginPath();
  const c = g.batCursor;
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 8;
  ctx.arc(c.x, c.y, 11, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffb84d';
  ctx.font = '12px sans-serif'; ctx.fillText('YOU', c.x-12, c.y+4);
  ctx.restore();
  // draw ball
  if(g.ball){
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, g.ball.radius, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  // draw runners
  ctx.fillStyle = '#ff8a65';
  for(const r of g.bases){
    if(!r) continue;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, 10, 12, 0, 0, Math.PI*2); ctx.fill();
    // small helmet doodle
    ctx.fillStyle = '#06325b';
    ctx.fillRect(r.x-6, r.y-16, 12,6);
    ctx.fillStyle = '#ff8a65';
  }
  // batter box outline doodle
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
  ctx.strokeRect(W*0.42, H*0.75, W*0.16, H*0.08);
}

// helper to draw rounded rect
function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if (typeof stroke === 'undefined') stroke = true;
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// --- Main loop ---
let last = 0;
function loop(t){
  const dt = (t-last)/16.666; last = t;
  if(game) game.update(dt);
  if(game) drawField(game);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Controls: joystick & keyboard ---
let baseRect = stickBase.getBoundingClientRect();
function updateBaseRect(){ baseRect = stickBase.getBoundingClientRect(); }
window.addEventListener('resize', updateBaseRect);
let vx=0, vy=0;
function stickMove(px,py){
  const cx = baseRect.left + baseRect.width/2;
  const cy = baseRect.top + baseRect.height/2;
  const dx = px - cx, dy = py - cy;
  const max = baseRect.width/2 - 14;
  const ndx = clamp(dx, -max, max);
  const ndy = clamp(dy, -max, max);
  stick.style.transform = `translate(${ndx}px, ${ndy}px)`;
  const nx = ndx / max; const ny = ndy / max;
  vx = nx * 7; vy = ny * 7;
}
stick.addEventListener('pointerdown', (e)=>{ stick.setPointerCapture(e.pointerId); updateBaseRect(); stickMove(e.clientX,e.clientY); });
window.addEventListener('pointermove', (e)=>{ if(e.pointerId && e.buttons === 0) return; if(e.pointerType && e.pointerType==='mouse' && e.buttons===0) return; if(e.preventDefault){} try{ if(e.clientX) stickMove(e.clientX,e.clientY);}catch(e){} });
window.addEventListener('pointerup', (e)=>{ stick.style.transform='translate(0,0)'; vx=0; vy=0; });

window.addEventListener('keydown', (e)=>{
  if(e.code === 'ArrowLeft'){ vx = -7; }
  if(e.code === 'ArrowRight'){ vx = 7; }
  if(e.code === 'ArrowUp'){ vy = -7; }
  if(e.code === 'ArrowDown'){ vy = 7; }
  if(e.code === 'Space'){ hitBtn.click(); }
});
window.addEventListener('keyup', (e)=>{
  if(e.code.startsWith('Arrow')){ vx = 0; vy = 0; }
});
setInterval(()=>{ if(game){ game.batCursor.x = clamp(game.batCursor.x + vx, W*0.36, W*0.64); game.batCursor.y = clamp(game.batCursor.y + vy, H*0.78, H*0.86); } }, 20);

// --- UI wiring ---
startBtn.addEventListener('click', ()=>{
  if(!game) game = new Game();
  const mode = modeSel.value;
  game.start(mode);
  startBtn.disabled = true;
  hitBtn.disabled = false;
});
hitBtn.addEventListener('click', ()=>{
  if(!game) return;
  game.playerHit();
});
resetBtn.addEventListener('click', ()=>{
  if(game){ game.stop(); }
  game = new Game();
  startBtn.disabled = false;
  hitBtn.disabled = true;
  logEl.innerHTML = '';
});

// initialize
game = new Game();
