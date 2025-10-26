// Baseball Nine v2 - cartoony 2.5D, CPU pitches, joystick batting, improved fielding
const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const pitchBtn = document.getElementById('pitch');
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

function log(s){
  const d = document.createElement('div'); d.textContent = s;
  logEl.prepend(d);
}

// Utility
function rand(a,b){return Math.random()*(b-a)+a}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}

// --- Game classes ---
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
    this.bases = [null,null,null]; // 1st,2nd,3rd runner objects
    this.mode = 'game';
    this.state = 'waiting'; // waiting, pitched, ballInPlay, resolving
    this.ball = null;
    this.fielders = this.makeFielders();
    this.batCursor = {x: W*0.5, y: H*0.78}; // player moves this to meet the pitch
    this.pitcher = {x: W*0.5, y: H*0.18};
    this.pitchCount = 0;
    this.homeRuns = 0;
    this.updateHUD();
    log('Game ready. Click Start.');
  }
  makeFielders(){
    // create 6 fielders with positions (cartoony)
    return [
      {name:'P', x:W*0.5, y:H*0.22},
      {name:'C', x:W*0.5, y:H*0.82},
      {name:'1B', x:W*0.78, y:H*0.62},
      {name:'2B', x:W*0.52, y:H*0.38},
      {name:'3B', x:W*0.22, y:H*0.62},
      {name:'SS', x:W*0.40, y:H*0.46}
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
    this.state = 'ready';
    this.strikes = 0;
    this.outs = 0;
    this.bases = [null,null,null];
    this.ball = null;
    this.fielders = this.makeFielders();
    this.updateHUD();
    log(`Starting ${mode==='hr'?'Home Run Derby':'Full Game'}.`);
    pitchBtn.disabled = false;
    hitBtn.disabled = false;
  }
  cpuPitch(){
    if(this.state === 'pitched' || this.state === 'ballInPlay') return;
    this.pitchCount++;
    this.strikes = clamp(this.strikes,0,2);
    // determine pitch target (x offset) and velocity
    const targetX = rand(W*0.35, W*0.65);
    const targetY = W*0.75; // near plate
    const speed = this.mode==='hr'? rand(6,9) : rand(7,11);
    // ball starts at pitcher and heads toward plate
    this.ball = {x:this.pitcher.x, y:this.pitcher.y, vx:(targetX-this.pitcher.x)/speed, vy:(H*0.78 - this.pitcher.y)/speed, radius:7, thrown:true, targetX};
    this.state = 'pitched';
    log('CPU pitches...');
  }
  playerHit(){
    if(this.state !== 'pitched') return;
    // determine contact quality by proximity of batCursor to ball projected position
    const ballPos = {x:this.ball.x, y:this.ball.y};
    const dx = ballPos.x - this.batCursor.x;
    const dy = ballPos.y - this.batCursor.y;
    const dist = Math.hypot(dx,dy);
    // allow some timing leniency: compute effective contact if dist < threshold
    const hitChance = clamp(1 - (dist / 60), 0, 1);
    const timing = Math.random();
    if(hitChance < 0.2 || timing > 0.98){
      // miss -> swing and miss -> strike (or foul if slightly off to sides)
      const side = ballPos.x < W*0.28 || ballPos.x > W*0.72;
      if(side){
        // foul
        this.strikes = Math.min(2, this.strikes + (this.strikes<2?1:0)); // foul doesn't add beyond 2
        log('Foul! Pitcher will throw again.');
        // keep state pitched so pitcher can throw again; do not change outs
        this.state = 'readyForPitch'; // keep pitched but allow another pitch
        return;
      } else {
        // swing and miss -> strike
        this.strikes++;
        log('Swing and miss — strike.');
        if(this.strikes >= 3){
          this.outs++;
          this.strikes = 0;
          log('Strikeout! Out recorded.');
          if(this.checkEndHalf()) return;
        }
        this.state = 'readyForPitch';
        this.updateHUD();
        return;
      }
    }
    // hit!
    const power = clamp(hitChance + rand(-0.1,0.15), 0.1, 1);
    const angle = rand(-0.6, 0.6);
    this.ball.vx = Math.cos(angle) * (4 + power*8);
    this.ball.vy = -Math.abs(Math.sin(angle)) * (2 + power*4);
    this.ball.thrown = false;
    this.state = 'ballInPlay';
    // create runner object starting at home
    const runner = {base:0, x:W*0.5, y:H*0.78, speed:1.2 + power*0.8, desiredBases: power>0.85?4: power>0.55?2:1};
    this.bases.unshift(runner); // treat as batter occupying front of array temporarily
    log('Ball hit into play!');
  }
  update(dt){
    if(this.state === 'pitched' && this.ball && this.ball.thrown){
      // advance pitch
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      // simple gravity to make plate arc
      this.ball.vy += 0.12;
      // if ball reaches plate area (y > H*0.75), allow hit or called strike (if no swing)
      if(this.ball.y > H*0.75){
        // if state still pitched, and player didn't swing, it's a called strike or ball
        if(this.state === 'pitched'){
          // if ball within strike zone horizontally, it's a strike; else ball
          if(this.ball.x > W*0.35 && this.ball.x < W*0.65){
            this.strikes++;
            log('Called strike.');
            if(this.strikes >= 3){
              this.outs++;
              this.strikes = 0;
              log('Strikeout!');
              if(this.checkEndHalf()) return;
            }
          } else {
            log('Ball — pitcher to pitch again.');
          }
          this.state = 'readyForPitch';
          this.ball = null;
        }
      }
    }
    // ball in play physics
    if(this.state === 'ballInPlay' && this.ball && !this.ball.thrown){
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      this.ball.vy += 0.2;
      // bounce on ground
      if(this.ball.y > H*0.82){
        this.ball.y = H*0.82;
        this.ball.vy *= -0.25;
        this.ball.vx *= 0.95;
      }
      // determine if ball leaves fair territory -> foul or homer
      const inFair = this.ball.x > W*0.22 && this.ball.x < W*0.78;
      if(this.ball.y < -50 || this.ball.x < -100 || this.ball.x > W+100){
        // over the fence home run: count runs = batter + occupied bases
        const runs = 1 + (this.bases.slice(1).filter(b=>b).length);
        this.score[this.top?0:1] += runs;
        log(`Over the fence! ${runs} run(s).`);
        this.bases = [null,null,null];
        this.ball = null;
        this.state = 'readyForPitch';
        this.updateHUD();
        return;
      }
      // if ball on ground, choose nearest fielder to go for it
      if(this.ball && this.ball.y >= H*0.45){
        const nearest = this.findNearestFielder(this.ball.x, this.ball.y);
        // move that fielder toward ball
        const f = nearest;
        const dx = this.ball.x - f.x, dy = this.ball.y - f.y;
        const dist = Math.hypot(dx,dy);
        const speed = 2.0;
        if(dist > 6){
          f.x += dx/dist * speed;
          f.y += dy/dist * speed;
        } else {
          // fielder reaches ball -> attempt play
          const success = Math.random() < 0.7; // 70% chance to make play
          if(success){
            // get lead runner out if within range
            if(this.bases.length && this.bases[0]){
              this.outs++;
              log(`${f.name} fields the ball and records an out!`);
              // remove batter-runner
              this.bases.shift();
              this.bases[2] = null; // prevent overflow
              if(this.checkEndHalf()) return;
            }
          } else {
            log(`${f.name} couldn't make the play; runners advance.`);
            // advance runners based on desiredBases
            for(let r of this.bases){
              if(r) r.base += Math.min(1, r.desiredBases);
            }
            this.scoreRuns();
          }
          this.ball = null;
          this.state = 'readyForPitch';
        }
      }
      // if ball goes foul (past foul lines) while still in play horizontally and not homer
      if(this.ball && (this.ball.x < W*0.22 || this.ball.x > W*0.78) && this.ball.y > H*0.5){
        // it's a foul ball -> count as strike if < 2 strikes; pitcher throws again
        log('Foul ball!');
        if(this.strikes < 2) this.strikes++;
        // remove batter runner placeholder if exists
        if(this.bases[0]) this.bases.shift();
        this.ball = null;
        this.state = 'readyForPitch';
        this.updateHUD();
        return;
      }
      // advance runners gradually if ball still flying
      for(let r of this.bases){
        if(!r) continue;
        // simple: move toward next base coords
        const target = this.baseCoords(r.base+1);
        r.x += (target.x - r.x) * 0.06 * r.speed;
        r.y += (target.y - r.y) * 0.06 * r.speed;
        // check scoring
        if(r.base >= 4){
          this.score[this.top?0:1] += 1;
          log('Run scored!');
          // remove runner
          const idx = this.bases.indexOf(r);
          if(idx !== -1) this.bases[idx] = null;
        }
      }
    }
    this.updateHUD();
  }
  baseCoords(n){
    if(n<=0) return {x:W*0.5, y:H*0.78};
    if(n===1) return {x:W*0.78, y:H*0.62};
    if(n===2) return {x:W*0.52, y:H*0.38};
    if(n===3) return {x:W*0.22, y:H*0.62};
    return {x:W*0.5, y:H*0.78};
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
    // move any runners beyond base 3 to score
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
      pitchBtn.disabled = false;
      return true;
    }
    return false;
  }
}

// --- Rendering ---
function draw(g){
  ctx.clearRect(0,0,W,H);
  // sky band
  ctx.fillStyle = '#9fd3ff';
  ctx.fillRect(0,0,W,H*0.25);
  // grass
  ctx.fillStyle = '#2f9f57';
  ctx.fillRect(0,H*0.25,W,H*0.75);
  // infield dirt
  ctx.beginPath();
  ctx.moveTo(W*0.5, H*0.78);
  ctx.lineTo(W*0.78,H*0.62);
  ctx.lineTo(W*0.52,H*0.38);
  ctx.lineTo(W*0.22,H*0.62);
  ctx.closePath();
  ctx.fillStyle = '#d9b48f';
  ctx.fill();
  // bases
  const bases = [
    {x:W*0.5,y:H*0.78},
    {x:W*0.78,y:H*0.62},
    {x:W*0.52,y:H*0.38},
    {x:W*0.22,y:H*0.62}
  ];
  for(const b of bases){
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x-10,b.y-10,20,20);
  }
  // draw fielders with simple cartoony bodies and shadow
  for(const f of g.fielders){
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(f.x, f.y+10, 18,8,0,0,Math.PI*2); ctx.fill();
    // body (circle)
    ctx.fillStyle = '#08306b';
    ctx.beginPath(); ctx.arc(f.x, f.y, 14,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.fillText(f.name, f.x-7, f.y+4);
  }
  // draw bat cursor (player)
  ctx.fillStyle = '#ffdd57';
  ctx.beginPath(); ctx.arc(g.batCursor.x, g.batCursor.y, 10,0,Math.PI*2); ctx.fill();
  // draw ball if exists
  if(g.ball){
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, g.ball.radius,0,Math.PI*2); ctx.fill();
    // stitches
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, g.ball.radius, 0, Math.PI*2); ctx.stroke();
  }
  // draw runners
  ctx.fillStyle = '#ff8a65';
  for(const r of g.bases){
    if(!r) continue;
    ctx.beginPath(); ctx.arc(r.x, r.y, 9,0,Math.PI*2); ctx.fill();
  }
}

// --- Main loop ---
let last = 0;
function loop(t){
  const dt = (t-last)/16.666; last = t;
  if(game) game.update(dt);
  if(game) draw(game);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Input: joystick & keyboard ---
let stickActive = false;
let baseRect = stickBase.getBoundingClientRect();
function updateBaseRect(){ baseRect = stickBase.getBoundingClientRect(); }
window.addEventListener('resize', updateBaseRect);
let vx=0, vy=0;
function stickMove(px,py){
  // px,py are client coords
  const cx = baseRect.left + baseRect.width/2;
  const cy = baseRect.top + baseRect.height/2;
  const dx = px - cx, dy = py - cy;
  const max = baseRect.width/2 - 12;
  const dist = Math.hypot(dx,dy);
  const ndx = clamp(dx, -max, max);
  const ndy = clamp(dy, -max, max);
  stick.style.transform = `translate(${ndx}px, ${ndy}px)`;
  // map to batCursor movement
  const nx = ndx / max;
  const ny = ndy / max;
  vx = nx * 6;
  vy = ny * 6;
}
stick.addEventListener('pointerdown', (e)=>{ stick.setPointerCapture(e.pointerId); stickActive=true; updateBaseRect(); stickMove(e.clientX,e.clientY); });
window.addEventListener('pointermove', (e)=>{ if(!stickActive) return; stickMove(e.clientX,e.clientY); });
window.addEventListener('pointerup', (e)=>{ stickActive=false; stick.style.transform='translate(0,0)'; vx=0; vy=0; });

window.addEventListener('keydown', (e)=>{
  if(e.code === 'ArrowLeft'){ vx = -6; }
  if(e.code === 'ArrowRight'){ vx = 6; }
  if(e.code === 'ArrowUp'){ vy = -6; }
  if(e.code === 'ArrowDown'){ vy = 6; }
  if(e.code === 'Space'){ hitBtn.click(); }
});
window.addEventListener('keyup', (e)=>{
  if(e.code.startsWith('Arrow')){ vx = 0; vy = 0; }
});

// game tick to move bat cursor according to vx,vy
setInterval(()=>{ if(game){ game.batCursor.x = clamp(game.batCursor.x + vx, W*0.2, W*0.8); game.batCursor.y = clamp(game.batCursor.y + vy, H*0.7, H*0.85); } }, 20);

// --- UI wiring ---
startBtn.addEventListener('click', ()=>{
  if(!game) game = new Game();
  const mode = modeSel.value;
  game.start(mode);
  startBtn.disabled = true;
  pitchBtn.disabled = false;
  hitBtn.disabled = false;
});
pitchBtn.addEventListener('click', ()=>{
  if(!game) return;
  game.cpuPitch();
});
hitBtn.addEventListener('click', ()=>{
  if(!game) return;
  game.playerHit();
});
resetBtn.addEventListener('click', ()=>{
  game = new Game();
  startBtn.disabled = false;
  pitchBtn.disabled = true;
  hitBtn.disabled = true;
  logEl.innerHTML = '';
});

// init
game = new Game();
