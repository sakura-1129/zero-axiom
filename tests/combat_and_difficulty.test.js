const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');

const repoRoot = path.resolve(__dirname, '..');

/**
 * Creates an isolated sandbox environment emulating browser globals for headless execution.
 */
function createGameContext() {
  const dummyEl = {
    style: { setProperty: () => {} },
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    addEventListener: () => {},
    querySelectorAll: () => [],
    setAttribute: () => {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    onclick: null,
  };

  const dummyCanvas = {
    style: {},
    width: 1200,
    height: 800,
    getContext: () => ({
      scale: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      setTransform: () => {},
      clearRect: () => {},
      translate: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      drawImage: () => {},
      moveTo: () => {},
      lineTo: () => {},
      setLineDash: () => {},
      fillText: () => {},
      strokeText: () => {},
      rotate: () => {},
    }),
  };

  const memStore = new Map();
  const mockStorage = {
    getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
    setItem: (k, v) => { memStore.set(k, String(v)); },
    removeItem: (k) => { memStore.delete(k); },
  };
  const sandbox = {
    Math,
    console,
    Map,
    Set,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    parseInt,
    isFinite,
    setTimeout,
    window: {
      innerWidth: 1200,
      innerHeight: 800,
      devicePixelRatio: 1,
      addEventListener: () => {},
      requestAnimationFrame: () => 1,
      localStorage: mockStorage,
      AudioContext: function () {
        return {
          createGain: () => ({ gain: { value: 0 }, connect: () => {} }),
          destination: {},
        };
      },
    },
    document: {
      getElementById: (id) => (id === 'game' ? dummyCanvas : dummyEl),
      createElement: () => dummyCanvas,
      addEventListener: () => {},
    },
    localStorage: mockStorage,
    requestAnimationFrame: () => 1,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;

  const ctx = vm.createContext(sandbox);

  ['js/utils.js', 'js/config.js', 'js/audio.js', 'js/render.js', 'js/analytics.js', 'js/ui.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, f), 'utf8'), ctx);
  });

  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, 'js/game.js'), 'utf8') +
      `
      globalThis.Game = Game;
      globalThis.update = update;
      globalThis.damageEnemy = damageEnemy;
      globalThis.killEnemy = killEnemy;
      globalThis.spawnEnemyRaw = spawnEnemyRaw;
      globalThis.spawnBullet = spawnBullet;
      globalThis.hitEnemyWithBullet = hitEnemyWithBullet;
      globalThis.rollDrop = rollDrop;
      globalThis.dropPickup = dropPickup;
      globalThis.addParticle = addParticle;
      globalThis.updateEnemies = updateEnemies;
      globalThis.updateParticles = updateParticles;
      globalThis.updateFx = updateFx;
      globalThis.drawWorld = drawWorld;
      globalThis.Render = Render;
      globalThis.Analytics = Analytics;
      globalThis.CFG = CFG;
      globalThis.ORBS = ORBS;
      globalThis.RELICS = RELICS;
      globalThis.RELIC_MAP = RELIC_MAP;
      globalThis.BOSS_CONFIGS = BOSS_CONFIGS;
      globalThis.triggerOrbSkill = triggerOrbSkill;
      globalThis.fireWeapon = fireWeapon;
      globalThis.separateEnemies = separateEnemies;
      globalThis.updateOrbs = updateOrbs;
      globalThis.castChain = castChain;
      globalThis.castShock = castShock;
      globalThis.fireMissiles = fireMissiles;
      globalThis.updateBeacons = updateBeacons;
      globalThis.spawnBoss = spawnBoss;
      globalThis.SKILLS = SKILLS;
      globalThis.SKILL_MAP = SKILL_MAP;
      globalThis.SKILL_SVGS = SKILL_SVGS;
      globalThis.MAX_ULTIMATES = MAX_ULTIMATES;
      globalThis.ARCH_THRESHOLDS = ARCH_THRESHOLDS;
      globalThis.ARCHETYPES = ARCHETYPES;
      globalThis.ARCHETYPE_ORDER = ARCHETYPE_ORDER;
      globalThis.COMBOS = COMBOS;
      globalThis.COMBO_MAP = COMBO_MAP;
      globalThis.COMBO_PARTNERS = COMBO_PARTNERS;
      globalThis.sortPair = sortPair;
      globalThis.getCombo = getCombo;
      if (typeof evaluateEvolution !== 'undefined') globalThis.evaluateEvolution = evaluateEvolution;
      globalThis.xpNeedFor = xpNeedFor;
      globalThis.hpScaleAt = hpScaleAt;
      globalThis.dmgScaleAt = dmgScaleAt;
      globalThis.hurtPlayer = hurtPlayer;
      globalThis.gainXp = gainXp;
      globalThis.effectiveDmg = effectiveDmg;
      globalThis.previewSkillDelta = previewSkillDelta;
      globalThis.rollSkills = rollSkills;
      globalThis.spawnRateAt = spawnRateAt;
      globalThis.pickEnemyType = pickEnemyType;
      `,
    ctx
  );

  return ctx;
}

test('1. Difficulty Curve: 6-minute (360s) progressive dust-to-millions hpScaleAt & dmgScaleAt', () => {
  const ctx = createGameContext();

  assert.strictEqual(ctx.CFG.duration, 360);
  assert.strictEqual(ctx.hpScaleAt(0), 1.0);
  assert.strictEqual(ctx.dmgScaleAt(0), 1.0);
  assert.strictEqual(Math.max(1, Math.round(ctx.CFG.enemies.walker.hp * ctx.hpScaleAt(0))), 3);
  assert.ok(Math.max(1, Math.round(ctx.CFG.enemies.walker.hp * ctx.hpScaleAt(25))) >= 6, 'Walkers climb progressively to >=6 HP by 25s');
  assert.ok(Math.max(1, Math.round(ctx.CFG.enemies.walker.dmg * ctx.dmgScaleAt(180))) >= 15, 'Walker damage inflates >=15 by 180s');

  assert.ok(ctx.xpNeedFor(1) >= 8, `Lv.1 XP requirement should be >= 8, got ${ctx.xpNeedFor(1)}`);
  assert.ok(ctx.xpNeedFor(5) >= 50, `Lv.5 XP requirement should be >= 50, got ${ctx.xpNeedFor(5)}`);
  assert.ok(ctx.xpNeedFor(10) >= 140, `Lv.10 XP requirement should be >= 140, got ${ctx.xpNeedFor(10)}`);

  const boss1Hp = Math.max(1, Math.round(ctx.CFG.enemies.boss.hp * ctx.hpScaleAt(110)));
  assert.ok(boss1Hp >= 8000, `Boss 1 HP at 110s should be >= 8k, got ${boss1Hp}`);

  const boss2Hp = Math.max(1, Math.round(ctx.CFG.enemies.boss.hp * 1.50 * ctx.hpScaleAt(230)));
  assert.ok(boss2Hp >= 180000, `Boss 2 HP at 230s should be >= 180k, got ${boss2Hp}`);

  const boss3Hp = Math.max(1, Math.round(ctx.CFG.enemies.boss.hp * 2.20 * ctx.hpScaleAt(340)));
  assert.ok(boss3Hp >= 2000000, `Boss 3 HP at 340s should be >= 2M, got ${boss3Hp}`);

  assert.ok(ctx.hpScaleAt(360) > 3000.0, `Endgame hpScaleAt(360) should be > 3000.0, got ${ctx.hpScaleAt(360)}`);
  assert.ok(ctx.dmgScaleAt(360) > 50.0, `Endgame dmgScaleAt(360) should be > 50.0, got ${ctx.dmgScaleAt(360)}`);
});

test('2. Difficulty Curve: Rebalanced spawnRateAt and enemy unlocks', () => {
  const ctx = createGameContext();

  assert.strictEqual(Math.round(ctx.spawnRateAt(0) * 100) / 100, 1.35);
  assert.ok(ctx.spawnRateAt(60) > 2.8);
  assert.strictEqual(ctx.spawnRateAt(400), 10.0, 'Spawn rate should cap at 10.0/s');

  for (let i = 0; i < 20; i++) {
    assert.strictEqual(ctx.pickEnemyType(15), 'walker');
  }

  let foundSprinter = false;
  for (let i = 0; i < 100; i++) {
    if (ctx.pickEnemyType(30) === 'sprinter') {
      foundSprinter = true;
      break;
    }
  }
  assert.ok(foundSprinter, 'Sprinter should spawn after t > 20s');

  assert.strictEqual(ctx.CFG.enemies.sprinter.speed, 146);
  assert.ok(ctx.CFG.enemies.charger, 'Charger archetype defined');
  assert.ok(ctx.CFG.enemies.shielder, 'Shielder archetype defined');

  const armorSkill = ctx.SKILL_MAP['armor'];
  assert.ok(armorSkill);
  const testPlayer = { stats: { armor: 0 } };
  armorSkill.apply(testPlayer);
  assert.strictEqual(Math.round(testPlayer.stats.armor * 100) / 100, 0.15);
});

test('3. Target Deformation and Hit Recoil on Damage', () => {
  const ctx = createGameContext();
  ctx.Game.start();

  const enemy = ctx.spawnEnemyRaw('walker', 100, 100, 1);
  assert.ok(enemy);
  enemy.hp = 100; // Ensure enemy survives hits to inspect decay and deformation states
  assert.strictEqual(enemy.squash, 0);
  assert.strictEqual(enemy.hitShake, 0);

  // Normal bullet hit
  const bullet = { x: 90, y: 100, vx: 500, vy: 0, dmg: 1, crit: false };
  ctx.damageEnemy(enemy, 1, false, bullet);

  assert.strictEqual(enemy.squash, 0.22, 'Normal hit applies 0.22 squash');
  assert.strictEqual(enemy.hitShake, 2.6, 'Normal hit applies 2.6 hitShake');
  assert.strictEqual(Math.round(enemy.squashAngle * 100) / 100, 0, 'Squash angle aligns with bullet vx');

  // Test decay in updateEnemies
  ctx.updateEnemies(0.05);
  assert.ok(enemy.squash < 0.22, 'Squash decays over time');
  assert.ok(enemy.hitShake < 2.6, 'Hit shake decays over time');

  // Critical hit applies stronger deformation
  ctx.damageEnemy(enemy, 1, true, { vx: 0, vy: 400 });
  assert.strictEqual(enemy.squash, 0.36, 'Crit applies 0.36 squash');
  assert.strictEqual(enemy.hitShake, 5.2, 'Crit applies 5.2 hitShake');
  assert.ok(Math.abs(enemy.squashAngle - Math.PI / 2) < 0.01, 'Squash angle aligns with vertical bullet');
});

test('4. Micro Impact Ring and Modern Swiss Geometric Sparks on Bullet Collision', () => {
  const ctx = createGameContext();
  ctx.Game.start();

  const enemy = ctx.spawnEnemyRaw('walker', 100, 100, 1);
  enemy.hp = 10;
  const initialFxLen = ctx.Game.fx.length;
  const initialParticleLen = ctx.Game.particles.length;
  const initialShake = ctx.Game.shake;

  // Bullet colliding with enemy
  const bullet = {
    id: 999,
    x: 100,
    y: 100,
    vx: 400,
    vy: 0,
    r: 9,
    dmg: 2,
    crit: false,
    hit: new Set(),
    pierce: 0,
    bounce: 0,
    dead: false,
  };

  ctx.hitEnemyWithBullet(bullet, enemy);

  // Verify camera impulse
  assert.ok(ctx.Game.shake > initialShake, 'Camera impulse triggered on hit');

  // Verify micro impact ring in Game.fx
  assert.strictEqual(ctx.Game.fx.length, initialFxLen + 1, 'Micro ring added to Game.fx');
  const ring = ctx.Game.fx[ctx.Game.fx.length - 1];
  assert.strictEqual(ring.kind, 'ring');
  assert.strictEqual(ring.color, '#0055FF', 'Normal hit micro ring uses cobalt');
  assert.strictEqual(ring.maxR, 10);
  assert.strictEqual(ring.life, 0.12);

  // Verify geometric particles spawned
  const newParticles = ctx.Game.particles.slice(initialParticleLen);
  assert.ok(newParticles.length >= 3, 'Spawned multiple geometric debris particles');

  const shapes = newParticles.map((p) => p.shape);
  assert.ok(shapes.includes('needle'), 'Includes directional needle spark');
  assert.ok(shapes.includes('square'), 'Includes rotating Swiss square/diamond');

  // Verify Modern Swiss palette colors
  const swissPalette = new Set(['#0055FF', '#FFB800', '#E63312', '#111315']);
  newParticles.forEach((p) => {
    assert.ok(swissPalette.has(p.color), `Particle color ${p.color} must be in Modern Swiss palette`);
  });

  // Verify Critical hit micro ring & cross particle
  const critBullet = {
    id: 1000,
    x: 100,
    y: 100,
    vx: 400,
    vy: 0,
    r: 9,
    dmg: 4,
    crit: true,
    hit: new Set(),
    pierce: 0,
    bounce: 0,
    dead: false,
  };
  const particleLenBeforeCrit = ctx.Game.particles.length;
  ctx.hitEnemyWithBullet(critBullet, enemy);

  const critRing = ctx.Game.fx[ctx.Game.fx.length - 1];
  assert.strictEqual(critRing.color, '#FFB800', 'Crit micro ring uses signal yellow');
  assert.strictEqual(critRing.maxR, 18);

  const critParticles = ctx.Game.particles.slice(particleLenBeforeCrit);
  const critShapes = critParticles.map((p) => p.shape);
  assert.ok(critShapes.includes('cross'), 'Crit hit spawns Modern Swiss cross mark');
});

test('5. Mercy Heal Drop Logic when Player HP < 35%', () => {
  const ctx = createGameContext();
  ctx.Game.start();

  const player = ctx.Game.player;
  player.maxHp = 100;

  // High HP state (100 HP >= 35%): heal drop rate is 0.8%
  player.hp = 100;
  let healCountHighHp = 0;
  const trials = 10000;
  for (let i = 0; i < trials; i++) {
    ctx.Game.pickups.length = 0;
    const enemy = { x: 50, y: 50, boss: false };
    const origRand = ctx.Math.random;
    ctx.Math.random = () => 0.012; // Between 0.008 and 0.018
    ctx.rollDrop(enemy);
    ctx.Math.random = origRand;

    if (ctx.Game.pickups.some((p) => p.kind === 'heal')) {
      healCountHighHp++;
    }
  }
  assert.strictEqual(healCountHighHp, 0, 'At 0.012 random value, high HP does NOT drop heal');

  // Low HP state (30 HP < 35%): heal drop rate is 1.8%
  player.hp = 30;
  let healCountLowHp = 0;
  for (let i = 0; i < trials; i++) {
    ctx.Game.pickups.length = 0;
    const enemy = { x: 50, y: 50, boss: false };
    const origRand = ctx.Math.random;
    ctx.Math.random = () => 0.012; // 0.012 < 0.018 -> should drop heal!
    ctx.rollDrop(enemy);
    ctx.Math.random = origRand;

    if (ctx.Game.pickups.some((p) => p.kind === 'heal')) {
      healCountLowHp++;
    }
  }
  assert.strictEqual(healCountLowHp, trials, 'At 0.012 random value, low HP DOES drop mercy heal');
});

test('6. Memory Management: Particles and FX rings cleanup via compact()', () => {
  const ctx = createGameContext();
  ctx.Game.start();

  // Add particles with 0.05s life
  for (let i = 0; i < 40; i++) {
    ctx.addParticle(0, 0, 10, 10, 2, '#0055FF', 0.05, 'square', 0, 5);
  }
  assert.ok(ctx.Game.particles.length >= 40);

  // Add micro ring fx with 0.05s life
  ctx.Game.fx.push({
    kind: 'ring',
    x: 0,
    y: 0,
    r: 2,
    maxR: 10,
    life: 0.05,
    max: 0.05,
    color: '#0055FF',
    dead: false,
  });
  assert.ok(ctx.Game.fx.length >= 1);

  // Update with dt = 0.08 (exceeding 0.05 life)
  ctx.updateParticles(0.08);
  ctx.updateFx(0.08);

  const activeTestParticles = ctx.Game.particles.filter((p) => p.color === '#0055FF' && p.shape === 'square');
  assert.strictEqual(activeTestParticles.length, 0, 'All expired particles are cleaned up');

  const activeTestRings = ctx.Game.fx.filter((f) => f.life <= 0);
  assert.strictEqual(activeTestRings.length, 0, 'All expired FX rings are cleaned up');
});

test('7. Cache Stability: Render.sprites cache does not leak during deformation', () => {
  const ctx = createGameContext();
  ctx.Game.start();

  // Draw 5 standard enemies of different archetypes
  const types = ['walker', 'sprinter', 'splitter', 'tank', 'shooter'];
  types.forEach((type, idx) => {
    const e = ctx.spawnEnemyRaw(type, 100 + idx * 50, 100, 1);
    // Apply varied squashes
    e.squash = 0.15 + idx * 0.05;
    e.squashAngle = Math.PI / 4 * idx;
    e.hitShake = 2.0;
  });

  const dummyCtx = ctx.document.getElementById('game').getContext('2d');
  ctx.drawWorld(dummyCtx);

  // Check sprites map size
  const spritesSize = ctx.Render.sprites.size;
  assert.ok(spritesSize < 25, `Render.sprites cache should be bounded (<25), got ${spritesSize}`);

  // Simulate multiple hits and re-renders
  for (let frame = 0; frame < 30; frame++) {
    ctx.Game.enemies.forEach((e) => {
      e.squash = Math.random() * 0.35;
      e.squashAngle = Math.random() * Math.PI * 2;
    });
    ctx.drawWorld(dummyCtx);
  }

  // Sprite count must NOT increase because e.r is never modified
  assert.strictEqual(
    ctx.Render.sprites.size,
    spritesSize,
    'Render.sprites cache size must remain strictly constant under target deformation'
  );
});

test('8. End-to-end combat simulation loop', () => {
  const ctx = createGameContext();
  ctx.Game.start();

  // Position player and spawn an enemy in front
  ctx.Game.player.x = 200;
  ctx.Game.player.y = 200;
  const enemy = ctx.spawnEnemyRaw('walker', 240, 200, 1);
  assert.ok(enemy);
  enemy.hp = 1;

  // Fire bullet at enemy
  ctx.spawnBullet(200, 200, 0, {
    speed: 500,
    dmg: 1,
    r: 9,
    crit: false,
    color: '#0055FF',
  });

  const killsBefore = ctx.Game.kills;

  // Run 10 ticks of 0.02s (0.2s total)
  for (let i = 0; i < 10; i++) {
    ctx.update(0.02);
  }

  // Enemy should be dead, kills incremented, and XP gained (or orbs spawned)
  assert.strictEqual(enemy.dead, true);
  assert.strictEqual(ctx.Game.kills, killsBefore + 1);
  assert.ok(ctx.Game.xp > 0 || ctx.Game.xpOrbs.length > 0, 'XP gained or orb dropped on enemy kill');
  assert.ok(ctx.Game.particles.length > 0, 'Modern Swiss geometric particles created');
});

test('9. Difficulty Selection scales HP, spawn rate, enemy stats, and XP curve', () => {
  const ctx = createGameContext();

  ctx.Game.setDifficulty('easy');
  ctx.Game.start();
  const easyXp1 = ctx.Game.xpNeed;
  const easySpawn0 = ctx.spawnRateAt(0);
  const easyHp120 = ctx.hpScaleAt(120);
  const easyTank = ctx.spawnEnemyRaw('tank', 200, 200, 1);

  ctx.Game.setDifficulty('normal');
  ctx.Game.start();
  const normXp1 = ctx.Game.xpNeed;
  const normSpawn0 = ctx.spawnRateAt(0);
  const normHp120 = ctx.hpScaleAt(120);
  const normTank = ctx.spawnEnemyRaw('tank', 200, 200, 1);

  ctx.Game.setDifficulty('hard');
  ctx.Game.start();
  const hardXp1 = ctx.Game.xpNeed;
  const hardSpawn0 = ctx.spawnRateAt(0);
  const hardHp120 = ctx.hpScaleAt(120);
  const hardTank = ctx.spawnEnemyRaw('tank', 200, 200, 1);

  assert.ok(easyXp1 < normXp1 && normXp1 < hardXp1, 'XP curve scales across easy < normal < hard');
  assert.ok(easySpawn0 < normSpawn0 && normSpawn0 < hardSpawn0, 'Spawn rate scales across easy < normal < hard');
  assert.ok(easyHp120 < normHp120 && normHp120 < hardHp120, 'HP scaling scales across easy < normal < hard');
  assert.ok(easyTank.speed < normTank.speed && normTank.speed < hardTank.speed, 'Enemy speed scales by difficulty');
  assert.ok(easyTank.dmg < normTank.dmg && normTank.dmg < hardTank.dmg, 'Enemy damage scales by difficulty');
});

test('10. Playable Orbs: Cobalt Overclock Dash, Crimson Scaled Pulse, and Amber Burst', () => {
  const ctx = createGameContext();

  // 1) Cobalt orb -> single pierce needle normally, twin needles + dash overclock on active
  ctx.Game.setOrb('cobalt');
  ctx.Game.start();
  assert.strictEqual(ctx.Game.player.orbId, 'cobalt');
  assert.strictEqual(ctx.Game.player.maxHp, 60);
  assert.strictEqual(ctx.Game.player.stats.dmg, 1);
  assert.ok(ctx.Game.player.stats.fireInterval >= 0.55, 'Opening fireInterval is balanced (>= 0.55s)');
  ctx.Game.bullets.length = 0;
  ctx.fireWeapon();
  assert.strictEqual(ctx.Game.bullets.length, 1, 'Cobalt basic attack fires 1 bullet at Lv.1');
  ctx.Game.player.iframe = 0;
  ctx.triggerOrbSkill();
  assert.ok(ctx.Game.player.dashT > 0, 'Cobalt active triggers dash');
  assert.ok(ctx.Game.player.overclockT >= 2.0, 'Cobalt active grants 2s overclock');
  assert.ok(ctx.Game.player.iframe >= 0.38, 'Cobalt dash grants invulnerability');
  ctx.Game.bullets.length = 0;
  ctx.fireWeapon();
  assert.strictEqual(ctx.Game.bullets.length, 2, 'Cobalt fires twin overclock needles only during overclock');

  // 2) Crimson orb -> heavy single cue-ball + scaled radial pulse (8 + 3.0 * dmg) within 165px
  ctx.Game.setOrb('crimson');
  ctx.Game.start();
  assert.strictEqual(ctx.Game.player.orbId, 'crimson');
  assert.strictEqual(ctx.Game.player.maxHp, 76);
  assert.strictEqual(ctx.Game.player.stats.dmg, 2, 'Crimson starts with 1 + 1 = 2 dmg');
  assert.ok(ctx.Game.player.stats.fireInterval >= 0.65, 'Crimson heavy reload >= 0.65s');
  ctx.Game.player.stats.crit = 0;
  ctx.Game.bullets.length = 0;
  ctx.fireWeapon();
  assert.strictEqual(ctx.Game.bullets.length, 1, 'Crimson basic attack fires 1 bullet at Lv.1');
  const nearEnemy = ctx.spawnEnemyRaw('tank', 80, 0, 1);
  nearEnemy.hp = 50;
  const farEnemy = ctx.spawnEnemyRaw('tank', 300, 0, 1);
  farEnemy.hp = 50;
  ctx.triggerOrbSkill();
  // 8 + 2 * 3.0 = 14 damage
  assert.strictEqual(nearEnemy.hp, 36, 'Crimson pulse deals scaled 14 damage inside 165px radius');
  assert.strictEqual(farEnemy.hp, 50, 'Crimson pulse ignores enemies outside radius');
  assert.ok(ctx.Game.fx.some(f => f.kind === 'ring' && f.color === '#E63312'), 'Crimson pulse creates vermilion shockwave');

  // 3) Amber orb -> single basic shot at Lv.1, Space burst fires 8 + bullets * 2 piercing bullets
  ctx.Game.setOrb('amber');
  ctx.Game.start();
  assert.strictEqual(ctx.Game.player.orbId, 'amber');
  assert.strictEqual(ctx.Game.player.maxHp, 60);
  assert.ok(ctx.Game.player.stats.crit > ctx.CFG.player.crit, 'Amber orb has bonus crit');
  ctx.Game.player.stats.crit = 0;
  ctx.Game.bullets.length = 0;
  ctx.fireWeapon();
  assert.strictEqual(ctx.Game.bullets.length, 1, 'Amber basic attack fires 1 bullet at Lv.1');
  ctx.Game.bullets.length = 0;
  ctx.triggerOrbSkill();
  assert.strictEqual(ctx.Game.bullets.length, 10, 'Amber skill fires 8 + 1*2 = 10 radial bullets');
  assert.ok(ctx.Game.bullets.every(b => b.pierce >= 1), 'Amber burst bullets pierce at least 1 enemy');

  // 4) Multi-shot upgrade trades fire rate (+12% fireInterval) instead of pure free DPS
  const fiBefore = ctx.Game.player.stats.fireInterval;
  ctx.SKILL_MAP.multi.apply(ctx.Game.player, 1);
  assert.ok(ctx.Game.player.stats.fireInterval > fiBefore * 1.10, 'Multi-shot increases fireInterval as trade-off');
});

test('11. Billiard Collision: High-speed knockback collision transfers momentum and deals damage', () => {
  const ctx = createGameContext();
  ctx.Game.setOrb('cobalt');
  ctx.Game.start();
  ctx.Game.sepTick = 1; // Ensure separateEnemies executes on next call

  const a = ctx.spawnEnemyRaw('tank', 100, 100, 1);
  const b = ctx.spawnEnemyRaw('tank', 120, 100, 1);
  a.hp = 28;
  b.hp = 28;
  a.kx = 260; // Relative velocity = 260 >= 150 threshold
  b.kx = 0;

  ctx.separateEnemies();

  assert.ok(a.hp < 28 && b.hp < 28, 'Both colliding enemies take billiard collision damage');
  assert.ok(b.kx > 100, 'Slow enemy receives 65% momentum transfer');
  assert.strictEqual(a.collideCd, 0.18, 'Collision cooldown set to 0.18s');
  assert.ok(ctx.Game.fx.some(f => f.kind === 'ring' && f.maxR === 16), 'Billiard impact spawns ring FX');
});

test('12. Digital Rules: Exact Zero (2x XP + burst), Overkill Arc, and Prominent Crit Floating Text', () => {
  const ctx = createGameContext();
  ctx.Game.start();
  ctx.Game.player.stats.dmg = 1;

  // Normal & Crit floating text prominence + Monster hurt floating text
  const dummy = ctx.spawnEnemyRaw('tank', 100, 100, 1);
  dummy.hp = 5000;
  ctx.Game.texts.length = 0;
  ctx.damageEnemy(dummy, 2, false, { x: 80, y: 100 });
  const normTxt = ctx.Game.texts[ctx.Game.texts.length - 1];
  assert.ok(normTxt.size >= 17, `Normal floating damage size should be >= 17, got ${normTxt.size}`);

  ctx.damageEnemy(dummy, 1200, true, { x: 80, y: 100 });
  const critTxt = ctx.Game.texts[ctx.Game.texts.length - 1];
  assert.strictEqual(critTxt.crit, true);
  assert.ok(critTxt.size >= 30, `1200+ crit floating damage size should be >= 30, got ${critTxt.size}`);

  // Monster attack floating number matches t=0 enemy attack (-tank.dmg)
  ctx.Game.player.iframe = 0;
  ctx.hurtPlayer(dummy);
  const hurtTxt = ctx.Game.texts[ctx.Game.texts.length - 1];
  assert.strictEqual(hurtTxt.str, '-' + ctx.CFG.enemies.tank.dmg, 'Monster hit displays -tank.dmg floating damage at t=0');

  // Exact Zero: multi-hit enemy landing on exact 0
  const target = ctx.spawnEnemyRaw('tank', 100, 100, 1);
  target.hp = 2;
  target.xp = 4;
  const neighbor = ctx.spawnEnemyRaw('tank', 140, 100, 1);
  neighbor.hp = 28;
  ctx.Game.xpOrbs.length = 0;

  ctx.damageEnemy(target, 2, false, { x: 80, y: 100 });
  assert.strictEqual(target.dead, true);
  assert.strictEqual(target.exactZero, true);
  assert.strictEqual(ctx.Game.xpOrbs[0].v, 8, 'Exact zero drops 2x XP');
  assert.ok(neighbor.hp < 28, 'Exact zero burst damages neighboring enemy');

  // Overkill Arc: overkill >= max(2, 0.45*dmg) chains 75% overkill to nearest enemy
  const weak = ctx.spawnEnemyRaw('walker', 300, 300, 1);
  weak.hp = 1;
  const nearby = ctx.spawnEnemyRaw('tank', 380, 300, 1);
  nearby.hp = 28;
  ctx.damageEnemy(weak, 21, false, { x: 260, y: 300 }); // overkill = 20 -> 75% = 15 arc damage
  assert.strictEqual(weak.dead, true);
  assert.strictEqual(nearby.hp, 13, 'Overkill arc deals 75% of 20 overkill damage (15 dmg)');
  assert.ok(ctx.Game.fx.some(f => f.kind === 'chain'), 'Overkill arc renders chain lightning FX');
});

test('13. Sub-Weapon Scaling, Core Breakthrough TIER II+, Preview Deltas & Capstones', () => {
  const ctx = createGameContext();
  ctx.Game.start();
  const p = ctx.Game.player;
  p.stats.crit = 0;

  // Upgrade preview shows exact before -> after delta
  const dmgPreview = ctx.previewSkillDelta(ctx.SKILL_MAP.dmg, 1);
  assert.ok(dmgPreview.includes('→'), `Skill card preview should show before → after delta, got: ${dmgPreview}`);

  // Core Breakthrough at Lv.5 triggers TIER II multiplier + MaxHP boost
  ctx.gainXp(2000);
  assert.ok(ctx.Game.level >= 5, 'Should reach >= Lv.5');
  assert.ok(p.coreTier >= 2, `Core tier should advance to >= 2, got ${p.coreTier}`);
  assert.ok(p.maxHp > 26, `Core breakthrough scales maxHp upward, got ${p.maxHp}`);
  assert.ok(ctx.effectiveDmg() >= 3, `Core breakthrough multiplies damage, got ${ctx.effectiveDmg()}`);

  // Sub-weapon scaling: chain scales with effectiveDmg & dmgMul
  p.stats.dmg = 10;
  ctx.SKILL_MAP.chain.apply(p, 1);
  const enemy = ctx.spawnEnemyRaw('tank', 150, 0, 1);
  enemy.hp = 500;
  ctx.castChain();
  assert.ok(enemy.hp < 500, `Chain should damage enemy using scaled dmgMul, enemy hp is ${enemy.hp}`);

  // Missiles count scales with multi-shot
  ctx.SKILL_MAP.missile.apply(p, 1);
  p.stats.bullets = 5;
  ctx.Game.bullets.length = 0;
  ctx.fireMissiles();
  assert.strictEqual(ctx.Game.bullets.length, 3, 'Missile count inherits multi-shot bonus');

  // Glass Core dual-choice: +55% dmgMul, +20% crit, -35% maxHp
  const hpBefore = p.maxHp;
  ctx.SKILL_MAP.glass_core.apply(p, 1);
  assert.ok(p.stats.dmgMul > 1.5);
  assert.ok(p.maxHp < hpBefore);

  // Deep cultivation paths (8 levels) & guaranteed owned-skill slot in rollSkills
  assert.strictEqual(ctx.SKILL_MAP.dmg.maxLv, 8);
  assert.strictEqual(ctx.SKILL_MAP.pierce.maxLv, 8);
  assert.strictEqual(ctx.SKILL_MAP.orb.maxLv, 8);
  ctx.Game.owned = { dmg: 2 };
  for (let i = 0; i < 20; i++) {
    const rolled = ctx.rollSkills(3);
    assert.ok(rolled.some(c => c.skill.id === 'dmg'), 'rollSkills guarantees at least 1 card from cultivated skill');
  }
  ctx.SKILL_MAP.dmg.apply(p, 5);
  assert.strictEqual(p.stats.midDmg, true, 'Lv.5 dmg unlocks mid-tier breakthrough');

  // Capstone Crit at Lv.8: critMult increases to >= 3.0
  ctx.SKILL_MAP.crit.apply(p, 8);
  assert.strictEqual(p.stats.capCrit, true);
  assert.ok(p.stats.critMult >= 3.0, `Capstone critMult should be >= 3.0, got ${p.stats.critMult}`);

  // Mechanical Capstones:
  // 1) capRate fires laser beam FX on 3rd shot
  ctx.SKILL_MAP.rate.apply(p, 8);
  p.shotCounter = 2;
  ctx.Game.fx.length = 0;
  ctx.fireWeapon();
  assert.ok(ctx.Game.fx.some(f => f.kind === 'beam'), 'capRate Lv.8 fires piercing laser beam');

  // 2) capBounce converts exhausted bounce bullet into spinning sawActive blade
  ctx.SKILL_MAP.bounce.apply(p, 8);
  const sawBullet = ctx.spawnBullet(100, 100, 0, { bounce: 0, pierce: 0 });
  const sawTarget = ctx.spawnEnemyRaw('tank', 100, 100, 1);
  sawTarget.hp = 500;
  ctx.hitEnemyWithBullet(sawBullet, sawTarget);
  assert.strictEqual(sawBullet.sawActive, true, 'capBounce Lv.8 transforms exhausted bullet into saw blade');
  assert.strictEqual(sawBullet.dead, false);

  // 3) capOrb builds orbLasers web
  ctx.SKILL_MAP.orb.apply(p, 8);
  ctx.updateOrbs(0.016);
  assert.ok(ctx.Game.orbLasers.length >= 2, 'capOrb Lv.8 connects orbiting satellites with laser web');

  // 4) Superposition of Pierce + Bounce: simultaneous ricochet fork while piercing + pierce recharge on bounce
  ctx.Game.bullets.length = 0;
  const supTarget1 = ctx.spawnEnemyRaw('tank', 200, 200, 1);
  supTarget1.hp = 500;
  const supTarget2 = ctx.spawnEnemyRaw('tank', 260, 220, 1);
  supTarget2.hp = 500;
  const supBullet = ctx.spawnBullet(200, 200, 0, { pierce: 2, bounce: 1, crit: false });
  ctx.hitEnemyWithBullet(supBullet, supTarget1);
  assert.strictEqual(supBullet.pierce, 1, 'Main bullet continues piercing (pierce 2 -> 1)');
  assert.strictEqual(supBullet.dead, false);
  assert.ok(ctx.Game.bullets.some(b => b.isRicochetFork), 'Pierce + Bounce superposition forks a ricochet bullet on hit');

  // Exhausted pierce + remaining bounce restores 1 pierce on bounce
  const supBullet2 = ctx.spawnBullet(200, 200, 0, { pierce: 1, bounce: 1, crit: false });
  supBullet2.pierce = 0; // simulate pierce just exhausted, basePierce === 1
  ctx.hitEnemyWithBullet(supBullet2, supTarget1);
  assert.strictEqual(supBullet2.bounce, 0, 'Bounce consumed');
  assert.strictEqual(supBullet2.pierce, 1, 'Bounce restores 1 pierce when basePierce > 0');
});

test('14. Boss Relics, Tactical Beacons, Charger & Shielder Mechanics, and 6-Min Victory', () => {
  const ctx = createGameContext();
  ctx.Game.start();

  // Boss 1 defeat queues relic choice
  ctx.spawnBoss(ctx.BOSS_CONFIGS[0]);
  assert.ok(ctx.Game.boss);
  ctx.killEnemy(ctx.Game.boss, null);
  assert.strictEqual(ctx.Game.pendingRelic, 1, 'Defeating Boss 1 queues Core Relic selection');

  // Charge Matrix relic increases maxCharges to 2
  ctx.RELIC_MAP.charge_matrix.apply(ctx.Game.player);
  assert.strictEqual(ctx.Game.player.maxCharges, 2);

  // Shielder reduces damage to linked ally by 60% and detonates on death
  const shielder = ctx.spawnEnemyRaw('shielder', 200, 0, 1);
  const ally = ctx.spawnEnemyRaw('tank', 240, 0, 1);
  ally.hp = 50;
  shielder.links = [ally.id];
  ally.shielded = 0.25;
  ctx.damageEnemy(ally, 10, false, null);
  assert.strictEqual(ally.hp, 46, 'Shielded ally takes 40% damage (4 of 10)');
  ctx.killEnemy(shielder, null);
  assert.ok(ally.hp < 46, 'Shielder overload deals true damage to linked ally on death');

  // Beacon spawns at t >= 45s and captures after 4s inside ring
  ctx.Game.time = 45;
  ctx.updateBeacons(0.05);
  assert.strictEqual(ctx.Game.beacons.length, 1, 'Tactical beacon spawns at 45s');
  const b = ctx.Game.beacons[0];
  ctx.Game.player.x = b.x;
  ctx.Game.player.y = b.y;
  for (let i = 0; i < 45; i++) ctx.updateBeacons(0.1);
  assert.strictEqual(ctx.Game.beacons.length, 0, 'Beacon captured and cleared after 4s inside');

  // 6-minute (360s) victory condition
  ctx.Game.time = 360;
  ctx.Game.pendingRelic = 0;
  ctx.Game.pendingLevel = 0;
  ctx.update(0.016);
  assert.strictEqual(ctx.Game.state, 'win', 'Surviving 6 minutes triggers win');
});

test('15. UI Integrity: Every DOM ID and every Skill/Relic SVG icon is present', () => {
  const ctx = createGameContext();
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(repoRoot, 'js/ui.js'), 'utf8');
  const m = uiSrc.match(/const ids = \[([\s\S]*?)\];/);
  assert.ok(m, 'UI.init ids array found');
  const ids = m[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
  const missingIds = ids.filter(id => !html.includes('id="' + id + '"'));
  assert.deepStrictEqual(missingIds, [], 'No missing DOM IDs in index.html');

  const allItems = [...ctx.SKILLS, ...ctx.RELICS];
  const missingSvgs = allItems.filter(it => !ctx.SKILL_SVGS[it.id]).map(it => it.id);
  assert.deepStrictEqual(missingSvgs, [], 'Every skill and relic has a Swiss SVG icon');
});

test('16. 4-Stage Evolution (I->II->III->IV), Archetype Mapping, and MAX_ULTIMATES = 2 Cap', () => {
  const ctx = createGameContext();

  // 1) Config completeness & schema checks
  assert.strictEqual(ctx.MAX_ULTIMATES, 2);
  assert.strictEqual(ctx.ARCH_THRESHOLDS.stage1, 1);
  assert.strictEqual(ctx.ARCH_THRESHOLDS.stage2, 10);
  assert.strictEqual(ctx.ARCH_THRESHOLDS.stage3, 20);
  assert.strictEqual(ctx.ARCH_THRESHOLDS.capLocked, 19);
  assert.deepStrictEqual([...ctx.ARCHETYPE_ORDER], ['xianxia', 'norse', 'xuanhuan', 'arcane', 'billiard', 'exact_zero']);
  for (const id of ctx.ARCHETYPE_ORDER) {
    const a = ctx.ARCHETYPES[id];
    assert.ok(a, `Archetype ${id} exists`);
    assert.strictEqual(a.stages.length, 3, `Archetype ${id} defines 3 stages`);
    assert.ok(ctx.COMBO_PARTNERS[id].length >= 1, `Archetype ${id} has >= 1 combo partner`);
  }
  assert.strictEqual(ctx.COMBOS.length, 6);
  assert.strictEqual(Object.keys(ctx.COMBO_MAP).length, 6);
  assert.strictEqual(ctx.COMBO_MAP[ctx.sortPair('xuanhuan', 'xianxia')].id, 'xian_xuan');
  assert.strictEqual(ctx.getCombo('exact_zero', 'arcane').id, 'arcane_zero');

  // Every skill, relic, and orb maps to valid archetype(s)
  for (const s of ctx.SKILLS) {
    assert.ok(ctx.ARCHETYPES[s.archetype], `Skill ${s.id} has valid archetype`);
    assert.ok(s.archPts === 1 || s.archPts === 2, `Skill ${s.id} has archPts 1 or 2`);
  }
  for (const r of ctx.RELICS) {
    assert.strictEqual(r.archetypes.length, 2, `Relic ${r.id} links 2 archetypes`);
    assert.strictEqual(r.catalystPts, 3, `Relic ${r.id} grants +3 catalystPts`);
  }
  for (const orbId of Object.keys(ctx.ORBS)) {
    assert.ok(ctx.ARCHETYPES[ctx.ORBS[orbId].archetype], `Orb ${orbId} maps to valid archetype`);
  }

  // 2) Evolution progression I -> II -> III -> IV via Game.chooseSkill
  ctx.Game.setOrb('cobalt');
  ctx.Game.start();
  const p = ctx.Game.player;
  assert.strictEqual(p.stage, 1);
  assert.strictEqual(p.maxedArchs.length, 0);
  assert.strictEqual(p.superposition, null);

  function pickSkill(id) {
    const curLv = ctx.Game.owned[id] || 0;
    ctx.Game.state = 'levelup';
    ctx.Game.modalMode = 'skill';
    ctx.Game.pendingLevel = 1;
    ctx.Game.choices = [{ skill: ctx.SKILL_MAP[id], lv: curLv }];
    ctx.Game.chooseSkill(0);
  }

  function pickRelic(id) {
    ctx.Game.state = 'levelup';
    ctx.Game.modalMode = 'relic';
    ctx.Game.pendingRelic = 1;
    ctx.Game.choices = [{ relic: ctx.RELIC_MAP[id] }];
    ctx.Game.chooseSkill(0);
  }

  // Stage I (>= 1 pt)
  pickSkill('pierce'); // +2 -> xianxia = 2
  assert.strictEqual(p.archetypes.xianxia, 2);
  assert.strictEqual(p.archStages.xianxia, 1);
  assert.strictEqual(p.stage, 1);

  // Stage II (>= 10 pts): 4 more core picks -> 10 pts
  for (let i = 0; i < 4; i++) pickSkill('pierce'); // total 10
  assert.strictEqual(p.archetypes.xianxia, 10);
  assert.strictEqual(p.archStages.xianxia, 2);
  assert.strictEqual(p.stage, 2);

  // Stage III (>= 20 pts): orb x4 (+8 -> 18) + twin_core relic (+3 -> 21 >= 20)
  for (let i = 0; i < 4; i++) pickSkill('orb');
  pickRelic('twin_core');
  assert.ok(p.archetypes.xianxia >= 20, `xianxia >= 20 pts, got ${p.archetypes.xianxia}`);
  assert.strictEqual(p.archStages.xianxia, 3);
  assert.deepStrictEqual([...p.maxedArchs], ['xianxia']);
  assert.strictEqual(p.stage, 3);
  assert.strictEqual(p.superposition, null);

  // Second path to Stage III (xuanhuan): dmg x8 (+16) + split x2 (+4) = 20 -> triggers Stage IV xian_xuan
  for (let i = 0; i < 8; i++) pickSkill('dmg');
  pickSkill('split');
  pickSkill('split');
  assert.ok(p.archetypes.xuanhuan >= 20, `xuanhuan >= 20 pts, got ${p.archetypes.xuanhuan}`);
  assert.strictEqual(p.archStages.xuanhuan, 3);
  assert.deepStrictEqual([...p.maxedArchs], ['xianxia', 'xuanhuan']);
  assert.strictEqual(p.stage, 4);
  assert.ok(p.superposition && p.superposition.id === 'xian_xuan', 'Triggers Ⅳ阶 红莲业火剑仙 superposition');

  // 3) MAX_ULTIMATES = 2 cap: 3rd archetype (norse) locks at <= 19 pts / Stage II
  for (let i = 0; i < 8; i++) pickSkill('chain'); // +16
  for (let i = 0; i < 8; i++) pickSkill('crit');  // would be +16 more -> capped at 19
  assert.ok(p.archetypes.norse <= ctx.ARCH_THRESHOLDS.capLocked, `3rd path capped <= 19 pts, got ${p.archetypes.norse}`);
  assert.ok(p.archStages.norse <= 2, `3rd path stage capped <= 2, got ${p.archStages.norse}`);
  assert.strictEqual(p.maxedArchs.length, ctx.MAX_ULTIMATES, 'maxedArchs strictly capped at MAX_ULTIMATES = 2');
  assert.strictEqual(p.superposition.id, 'xian_xuan', 'Existing Stage IV superposition remains locked');
});

test('17. Playstyle Analytics: Telemetry tracking, 5D Radar, Titles, and History Persistence', () => {
  const ctx = createGameContext();
  ctx.Game.start();

  // 1) Zero-time edge case produces finite clamped scores
  const zeroAnalysis = ctx.Analytics.computeStyle({ time: 0, dmgDealt: 0 });
  for (const k of ['aggression', 'mobility', 'control', 'axiom', 'resilience']) {
    const v = zeroAnalysis.scores[k];
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `Score ${k} must be finite [0,100], got ${v}`);
  }

  // 2) Live telemetry hooks record primary, billiard, exact zero, and skill casts
  const e1 = ctx.spawnEnemyRaw('tank', 100, 100, 1);
  e1.hp = 100;
  ctx.damageEnemy(e1, 20, true, { primary: true, x: 80, y: 100 });
  ctx.damageEnemy(e1, 15, false, { isBilliard: true, x: 90, y: 100 });
  ctx.triggerOrbSkill();
  assert.strictEqual(ctx.Game.telemetry.dmgPrimary, 20);
  assert.strictEqual(ctx.Game.telemetry.dmgBilliard, 15);
  assert.strictEqual(ctx.Game.telemetry.billiardHits, 1);
  assert.strictEqual(ctx.Game.telemetry.maxCritDmg, 20);
  assert.strictEqual(ctx.Game.telemetry.skillCasts, 1);

  // 3) Style classification identifies Billiard & Exact Zero specialists
  const billiardStyle = ctx.Analytics.computeStyle({
    time: 120, dmgDealt: 1000, dmgPrimary: 600, dmgBilliard: 300, billiardHits: 60,
  });
  assert.strictEqual(billiardStyle.title, '台球物理学家');

  const ezStyle = ctx.Analytics.computeStyle({
    time: 120, dmgDealt: 1000, dmgPrimary: 700, dmgExactZero: 200, dmgOverkill: 100, exactZeroCount: 35,
  });
  assert.strictEqual(ezStyle.title, '数字处刑官');

  // 4) History persistence caps at 25 runs and generates career radar & trend SVG
  ctx.Analytics.clearHistory();
  for (let i = 0; i < 28; i++) {
    ctx.Analytics.saveRun({
      win: i % 2 === 0, orbId: 'cobalt', difficulty: 'normal',
      time: 60 + i * 5, level: 5 + i, kills: 100 + i, dmgDealt: 5000, peakDps: 200 + i,
      dmgPrimary: 4000, dmgSub: 1000, dmgBilliard: 0, dmgExactZero: 0, dmgOverkill: 0,
    });
  }
  const hist = ctx.Analytics.loadHistory();
  assert.strictEqual(hist.length, 25, 'History storage caps at 25 runs');
  const career = ctx.Analytics.aggregateCareer(hist);
  assert.strictEqual(career.runs, 25);
  assert.ok(ctx.Analytics.renderRadarSVG(career.scores, '#0055FF').includes('<polygon'));
  assert.ok(ctx.Analytics.renderTrendSVG(hist).includes('<path'));
});


