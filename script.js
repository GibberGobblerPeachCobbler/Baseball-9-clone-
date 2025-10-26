// Baseball Nine — simple playable baseball game suitable for GitHub Pages
const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const pitchBtn = document.getElementById('pitchBtn');
const swingBtn = document.getElementById('swingBtn');
const nextHalfBtn = document.getElementById('nextHalfBtn');
const logEl = document.getElementById('log');
const scoreEl = document.getElementById('score');
const inningEl = document.getElementById('inning');
const outsEl = document.getElementById('outs');

const WIDTH = canvas.width, HEIGHT = canvas.height;
let game = null;

function log(text){
  const p = document.createElement('div');
  p.textContent = text;
  logEl.prepend(p);
}

function rand(min,max){ return Math.random()*(max-min)+min }

class Game {
  constructor(){
    this.reset();
  }
  reset(){
    this.inning = 1;
    this.top = true; // top = visiting team at bat
    this.score = [0,0]; // [visitors, home]
    this.outs = 0;
    this.bases = [false,false,false]; // 1st,2nd,3rd
    this.state = 'idle'; // idle, pitched, ballInPlay, resolving
    this.batter = 1;
    this.pitchCount = 0;
    this.baseRunners = []; // array of runner objects
    this.fielders = this.createFielders();
    this.ball = null;
    this.turnLabel = () => `${this.inning} (${this.top?'Top':'Bot'})`;
    this.updateHUD();
    log('Welcome to Baseball Nine! Click Start Game to begin.');
  }
  createFielders(){
    // place six fielders: pitcher, catcher, 1st,2nd,3rd,short
    return {
      pitcher:{x:WIDTH*0.5, y:HEIGHT*0.4},
      catcher:{x:WIDTH*0.5, y:HEIGHT*0.75},
      first:{x:WIDTH*0.72,y:HEIGHT*0.55},
      second:{x:WIDTH*0.5,y:HEIGHT*0.3},
      third:{x:WIDTH*0.28,y:HEIGHT*0.55},
      short:{x:WIDTH*0.42,y:HEIGHT*0.45}
    };
  }
  updateHUD(){
    scoreEl.textContent = `Score: ${this.score[0]} - ${this.score[1]}`;
    inningEl.textContent = `Inning: ${this.turnLabel()}`;
    outsEl.textContent = `Outs: ${this.outs}`;
  }
  startHalf(){
    this.outs = 0;
    this.bases = [false,false,false];
    this.baseRunners = [];
    this.state = 'idle';
    this.pitchCount = 0;
    this.ball = null;
    this.updateHUD();
    log(`Starting ${this.turnLabel()}. ${this.top? 'Visitors bat' : 'Home bat'}.`);
  }
  pitch(){
    if(this.state !== 'idle') return;
    this.state = 'pitched';
    this.pitchCount++;
    this.ball = {x: this.fieldX(0.5), y: this.fieldY(0.7), vx:0, vy:0, radius:6, thrown:true};
    log('Pitch thrown! Press Swing to try hitting.');
  }
  swing(){
    if(this.state !== 'pitched') return;
    // Determine outcome: miss (strike), foul (maybe), or hit.
    const r = Math.random();
    if(r < 0.25){
      // miss -> strike
      log('Missed! Strike.');
      // count strike as out when 3 strikes as simplified: 3rd strike = out
      if(this.pitchCount >= 3){
        this.outs++;
        log('Strikeout! Out recorded.');
        if(this.checkEndHalf()) return;
      }
      this.state = 'idle';
    } else {
      // hit
      const hitPower = rand(0.2,1.0);
      const angle = rand(-0.6,0.6);
      // ball in play with velocity
      this.ball.vx = Math.cos(angle)*hitPower*8;
      this.ball.vy = -Math.abs(Math.sin(angle))*hitPower*6 - 2;
      this.ball.thrown = false;
      this.state = 'ballInPlay';
      log('Ball hit into play!');
      // create a runner for batter
      const runner = {base:0, x:this.fieldX(0.5), y:this.fieldY(0.78), speed: 1.2 + hitPower*0.8, targetBase:1};
      this.baseRunners.push(runner);
      // random extra base based on power
      runner.desiredBases = hitPower > 0.8 ? 4 : hitPower > 0.55 ? 2 : 1;
    }
    this.updateHUD();
  }
  fieldX(norm){ return norm*WIDTH }
  fieldY(norm){ return norm*HEIGHT }
  update(dt){
    if(this.state === 'ballInPlay' && this.ball){
      // move ball
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      // gravity
      this.ball.vy += 0.25;
      // if ball hits ground simulate rolling
      if(this.ball.y > HEIGHT*0.8){
        this.ball.vy *= -0.2;
        this.ball.vx *= 0.95;
        this.ball.y = HEIGHT*0.8;
      }
      // fielders run to ball
      for(let f in this.fielders){
        const fld = this.fielders[f];
        const dx = this.ball.x - fld.x, dy = this.ball.y - fld.y;
        const dist = Math.hypot(dx,dy);
        const speed = 1.6;
        if(dist > 6){
          fld.x += dx/dist*speed;
          fld.y += dy/dist*speed;
        }
      }
      // if any fielder near ball -> attempt play
      for(let f in this.fielders){
        const fld = this.fielders[f];
        const d = Math.hypot(fld.x - this.ball.x, fld.y - this.ball.y);
        if(d < 12){
          // fielder caught/fields ball
          // decide if throw to base can get runner out
          const throwTo = this.findBestThrowTarget();
          const success = Math.random() < 0.6; // chance to get out
          if(success && throwTo){
            // get lead runner out
            this.outs++;
            log(`Fielder throws to ${throwTo} and records an out!`);
            // remove lead runner if any
            if(this.baseRunners.length) this.baseRunners.shift();
            if(this.checkEndHalf()) return;
          } else {
            log('Fielder could not make the play; runners advance.');
            // advance runners depending on hit
            for(let r of this.baseRunners){
              r.base += Math.min(1, r.desiredBases);
            }
            this.scoreRuns();
          }
          this.state = 'resolving';
          this.ball = null;
          break;
        }
      }
      // safety: if ball goes out beyond edges: home run
      if(this.ball && (this.ball.x < 0 || this.ball.x > WIDTH || this.ball.y < 0)){
        // homerun
        const runs = 1 + this.baseRunners.length;
        this.score[this.top?0:1] += runs;
        log(`Over the fence! ${runs} run(s) scored.`);
        this.baseRunners = [];
        this.ball = null;
        this.state = 'idle';
        this.updateHUD();
      }
      // advance runners towards desired bases
      for(let r of this.baseRunners){
        r.x += (this.baseX(r.base+1) - r.x) * 0.06 * r.speed;
        r.y += (this.baseY(r.base+1) - r.y) * 0.06 * r.speed;
        if(Math.hypot(r.x-this.baseX(r.base+1), r.y-this.baseY(r.base+1)) < 6){
          r.base += 1;
          if(r.base >= r.desiredBases){
            // scored
            if(r.base >= 4){
              this.score[this.top?0:1] += 1;
              log('A runner scored!');
            }
          }
        }
      }
    }
  }
  baseX(baseNum){
    // 1-> first, 2->second, 3->third, 4->home (approx coords)
    if(baseNum <= 0) return this.fieldX(0.5);
    if(baseNum === 1) return this.fieldX(0.72);
    if(baseNum === 2) return this.fieldX(0.5);
    if(baseNum === 3) return this.fieldX(0.28);
    return this.fieldX(0.5);
  }
  baseY(baseNum){
    if(baseNum <= 0) return this.fieldY(0.78);
    if(baseNum === 1) return this.fieldY(0.55);
    if(baseNum === 2) return this.fieldY(0.30);
    if(baseNum === 3) return this.fieldY(0.55);
    return this.fieldY(0.78);
  }
  findBestThrowTarget(){
    // simple: try to get nearest base with a runner
    if(this.baseRunners.length === 0) return 'home';
    return 'first';
  }
  scoreRuns(){
    // move any runners that passed base 3 to score
    const still = [];
    for(let r of this.baseRunners){
      if(r.base >= 4){
        this.score[this.top?0:1] += 1;
        log('Run scored!');
      } else {
        still.push(r);
      }
    }
    this.baseRunners = still;
    this.updateHUD();
  }
  checkEndHalf(){
    if(this.outs >= 3){
      log(`Three outs — ${this.top? 'Top' : 'Bottom'} of ${this.inning} ends.`);
      nextHalfBtn.disabled = false;
      pitchBtn.disabled = true;
      swingBtn.disabled = true;
      this.state = 'idle';
      return true;
    }
    this.updateHUD();
    return false;
  }
  nextHalf(){
    nextHalfBtn.disabled = true;
    this.top = !this.top;
    if(this.top) this.inning++;
    this.startHalf();
  }
}

function drawField(g){
  // background
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  // grass shape
  ctx.fillStyle = '#2b8f4a';
  ctx.fillRect(0,0,WIDTH,HEIGHT);
  // infield diamond
  ctx.beginPath();
  ctx.moveTo(g.fieldX(0.5), g.fieldY(0.78)); // home
  ctx.lineTo(g.fieldX(0.72), g.fieldY(0.55)); // first
  ctx.lineTo(g.fieldX(0.5), g.fieldY(0.30)); // second
  ctx.lineTo(g.fieldX(0.28), g.fieldY(0.55)); // third
  ctx.closePath();
  ctx.fillStyle = '#d9b48f';
  ctx.fill();
  // draw bases
  const bases = [
    {x:g.fieldX(0.5), y:g.fieldY(0.78), name:'home'},
    {x:g.fieldX(0.72), y:g.fieldY(0.55), name:'first'},
    {x:g.fieldX(0.5), y:g.fieldY(0.30), name:'second'},
    {x:g.fieldX(0.28), y:g.fieldY(0.55), name:'third'}
  ];
  for(let b of bases){
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x-8,b.y-8,16,16);
  }
  // draw fielders
  ctx.fillStyle = '#08306b';
  for(let f in g.fielders){
    const p = g.fielders[f];
    ctx.beginPath(); ctx.arc(p.x,p.y,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.fillText(f[0].toUpperCase(), p.x-6, p.y+4);
    ctx.fillStyle = '#08306b';
  }
  // draw ball
  if(g.ball){
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(g.ball.x,g.ball.y,g.ball.radius,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.ball.x,g.ball.y,g.ball.radius,0,Math.PI*2); ctx.stroke();
  }
  // draw runners
  ctx.fillStyle = '#ffdd57';
  for(let r of g.baseRunners){
    ctx.beginPath(); ctx.arc(r.x,r.y,7,0,Math.PI*2); ctx.fill();
  }
}

let last = 0;
function loop(t){
  const dt = (t-last)/16.666; last = t;
  if(game) game.update(dt);
  if(game) drawField(game);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// UI wiring
startBtn.addEventListener('click', ()=>{
  game = new Game();
  game.startHalf();
  startBtn.disabled = true;
  pitchBtn.disabled = false;
  swingBtn.disabled = false;
  nextHalfBtn.disabled = true;
});

pitchBtn.addEventListener('click', ()=> {
  if(!game) return;
  game.pitch();
});

swingBtn.addEventListener('click', ()=> {
  if(!game) return;
  game.swing();
});

nextHalfBtn.addEventListener('click', ()=> {
  if(!game) return;
  game.nextHalf();
});

// accessibility: keyboard shortcuts
window.addEventListener('keydown', (e)=>{
  if(e.key === 'p') pitchBtn.click();
  if(e.key === 's') swingBtn.click();
});
