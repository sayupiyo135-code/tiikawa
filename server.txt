const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const players = new Map();
const drops = new Map();
const grasses = new Map();

const WORLD = { width: 2400, height: 1600 };
const VILLAGE = { x: 300, y: 300, w: 700, h: 520 };
const SECRET = { x: 1650, y: 950, w: 500, h: 420 };
const PASSWORD = process.env.FIGHT_PASSWORD || "hiddenfight";
const MAX_SPEED = 260;
const INVENTORY_LIMIT = 20;

function makePlayer(id) {
  return {
    id,
    name: "もふ" + Math.floor(Math.random() * 900 + 100),
    x: 560, y: 560,
    hp: 100, hunger: 100,
    coins: 50, level: 1, xp: 0,
    inventory: [{ id: "riceball", name: "おにぎり", emoji: "🍙", qty: 2, type: "food", hunger: 25 }],
    fighting: false,
    fightUnlocked: false,
    alive: true,
    lastAttack: 0,
    lifeId: 1,
    input: { x: 0, y: 0 },
    lastTick: Date.now()
  };
}

function initGrass() {
  for (let i = 0; i < 90; i++) {
    const id = "grass_" + i;
    grasses.set(id, {
      id,
      x: 180 + Math.random() * (WORLD.width - 360),
      y: 180 + Math.random() * (WORLD.height - 360),
      active: true,
      respawnAt: 0
    });
  }
}
initGrass();

function cleanPlayer(p) {
  return {
    id:p.id, name:p.name, x:p.x, y:p.y, hp:p.hp, hunger:p.hunger,
    coins:p.coins, level:p.level, xp:p.xp, fighting:p.fighting,
    fightUnlocked:p.fightUnlocked, alive:p.alive, lifeId:p.lifeId
  };
}

function itemCount(p) {
  return p.inventory.reduce((n, i) => n + i.qty, 0);
}

function addItem(p, item) {
  if (itemCount(p) + item.qty > INVENTORY_LIMIT) return false;
  const found = p.inventory.find(i => i.id === item.id && JSON.stringify(i) === JSON.stringify({...i, qty:item.qty}));
  if (found) found.qty += item.qty;
  else p.inventory.push({...item});
  return true;
}

function removeItem(p, itemId, qty) {
  const item = p.inventory.find(i => i.id === itemId);
  if (!item || item.qty < qty) return null;
  item.qty -= qty;
  const out = {...item, qty};
  if (item.qty <= 0) p.inventory = p.inventory.filter(i => i !== item);
  return out;
}

function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x+r.w && p.y >= r.y && p.y <= r.y+r.h;
}

function createDrop(ownerId, x, y, item, ttl, deathDrop=false, ownerLifeId=null) {
  const id = "drop_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  drops.set(id, {
    id, ownerId, ownerLifeId, x, y, item:{...item},
    expiresAt: Date.now() + ttl,
    deathDrop,
    picked:false
  });
  return id;
}

function killPlayer(p, killerId=null) {
  if (!p.alive) return;
  p.alive = false;

  // Snapshot first, then create drops, then reset.
  const snapshot = p.inventory.map(i => ({...i}));
  for (const item of snapshot) {
    createDrop(p.id, p.x + (Math.random()*50-25), p.y + (Math.random()*50-25), item, 20000, true, p.lifeId);
  }

  p.lifeId++;
  p.hp = 100;
  p.hunger = 100;
  p.coins = 0;
  p.level = 1;
  p.xp = 0;
  p.inventory = [{ id:"riceball", name:"おにぎり", emoji:"🍙", qty:1, type:"food", hunger:25 }];
  p.fighting = false;

  setTimeout(() => {
    p.x = 560; p.y = 560; p.alive = true;
    const s = io.sockets.sockets.get(p.id);
    if (s) s.emit("notice", "💀 倒されました。新しい生活が始まります。");
  }, 1500);
}

function broadcastWorld() {
  const now = Date.now();

  for (const g of grasses.values()) {
    if (!g.active && now >= g.respawnAt) {
      g.active = true;
      g.x = 180 + Math.random() * (WORLD.width - 360);
      g.y = 180 + Math.random() * (WORLD.height - 360);
    }
  }

  for (const [id, d] of drops) {
    if (!d.picked && now >= d.expiresAt) drops.delete(id);
  }

  const state = {
    players: [...players.values()].map(cleanPlayer),
    drops: [...drops.values()].filter(d => !d.picked),
    grasses: [...grasses.values()].filter(g => g.active),
    world: WORLD, village: VILLAGE, secret: SECRET
  };
  io.emit("world", state);
}

setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) {
    if (!p.alive) continue;
    const dt = Math.min(0.05, (now - p.lastTick) / 1000);
    p.lastTick = now;

    let dx = p.input.x || 0, dy = p.input.y || 0;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    p.x = Math.max(20, Math.min(WORLD.width-20, p.x + dx * MAX_SPEED * dt));
    p.y = Math.max(20, Math.min(WORLD.height-20, p.y + dy * MAX_SPEED * dt));

    p.hunger = Math.max(0, p.hunger - dt * 0.45);
    if (p.hunger <= 0) p.hp = Math.max(0, p.hp - dt * 3);
    if (p.hp <= 0) killPlayer(p);
  }
  broadcastWorld();
}, 50);

io.on("connection", socket => {
  const p = makePlayer(socket.id);
  players.set(socket.id, p);

  socket.emit("init", { self: cleanPlayer(p), passwordHint: "秘密の格闘パスワードを知る者だけが参加できる…" });
  socket.emit("notice", "村へようこそ！ 草を刈ってお金を稼ごう。");

  socket.on("input", input => {
    if (!p.alive || !input) return;
    p.input = {
      x: Math.max(-1, Math.min(1, Number(input.x) || 0)),
      y: Math.max(-1, Math.min(1, Number(input.y) || 0))
    };
  });

  socket.on("setName", name => {
    p.name = String(name || "").trim().slice(0, 12) || p.name;
  });

  socket.on("grass", id => {
    const g = grasses.get(id);
    if (!p.alive || !g || !g.active || Math.hypot(p.x-g.x,p.y-g.y) > 90) return;
    g.active = false; g.respawnAt = Date.now() + 15000;
    p.coins += 10; p.xp += 5;
    if (p.xp >= p.level * 40) { p.xp = 0; p.level++; }
    addItem(p, { id:"weed", name:"草", emoji:"🌿", qty:1, type:"material" });
    socket.emit("notice", "🌱 草むしり成功！ +10コイン");
  });

  socket.on("eat", itemId => {
    if (!p.alive) return;
    const item = p.inventory.find(i => i.id === itemId);
    if (!item || item.type !== "food") return;
    const removed = removeItem(p, itemId, 1);
    p.hunger = Math.min(100, p.hunger + (removed.hunger || 20));
    socket.emit("notice", `${removed.emoji} 食べた！ お腹が回復`);
  });

  socket.on("drop", ({itemId, qty}) => {
    if (!p.alive || p.fighting) return;
    qty = Math.max(1, Math.floor(Number(qty)||1));
    const item = removeItem(p, itemId, qty);
    if (!item) return;
    createDrop(p.id, p.x, p.y, item, 60000, false, p.lifeId);
  });

  socket.on("pickup", id => {
    const d = drops.get(id);
    if (!p.alive || !d || d.picked || Date.now() >= d.expiresAt) return;
    if (Math.hypot(p.x-d.x,p.y-d.y) > 100) return;
    if (d.deathDrop && d.ownerId === p.id) return;
    if (!addItem(p, d.item)) {
      socket.emit("notice", "🎒 インベントリがいっぱい！");
      return;
    }
    d.picked = true;
    drops.delete(id);
  });

  socket.on("unlockFight", password => {
    if (String(password) !== PASSWORD) {
      socket.emit("notice", "パスワードが違います。");
      return;
    }
    p.fightUnlocked = true;
    socket.emit("notice", "🔓 裏格闘が解放された！");
  });

  socket.on("toggleFight", () => {
    if (!p.fightUnlocked || !p.alive) return;
    if (!inRect(p, SECRET)) {
      socket.emit("notice", "🕳️ 裏格闘場の中でのみ切り替えできます。");
      return;
    }
    p.fighting = !p.fighting;
    socket.emit("notice", p.fighting ? "⚔️ 裏格闘モード ON" : "🕊️ 裏格闘モード OFF");
  });

  socket.on("attack", () => {
    if (!p.alive || !p.fighting || !inRect(p, SECRET)) return;
    const now = Date.now();
    if (now - p.lastAttack < 550) return;
    p.lastAttack = now;

    for (const target of players.values()) {
      if (target.id === p.id || !target.alive || !target.fighting || !inRect(target, SECRET)) continue;
      if (Math.hypot(p.x-target.x,p.y-target.y) <= 105) {
        target.hp = Math.max(0, target.hp - 20);
        if (target.hp <= 0) killPlayer(target, p.id);
      }
    }
  });

  socket.on("shopFood", () => {
    if (!p.alive) return;
    if (Math.hypot(p.x-740,p.y-430) > 120) {
      socket.emit("notice", "🍙 食べ物屋の近くで購入してください。");
      return;
    }
    if (p.coins < 15) return socket.emit("notice", "コインが足りません。");
    if (!addItem(p, { id:"riceball", name:"おにぎり", emoji:"🍙", qty:1, type:"food", hunger:25 })) return socket.emit("notice", "🎒 インベントリがいっぱい！");
    p.coins -= 15;
    socket.emit("notice", "🍙 おにぎりを買いました！");
  });

  socket.on("inventoryRequest", () => {
    socket.emit("inventory", p.inventory.map(i => ({...i})));
  });

  socket.on("disconnect", () => players.delete(socket.id));
});

server.listen(PORT, () => console.log(`Server running on ${PORT}`));
