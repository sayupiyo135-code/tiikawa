const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const players = new Map();
const drops = new Map();
const grasses = new Map();

const WORLD = {
  width: 2400,
  height: 1600
};

const VILLAGE = {
  x: 300,
  y: 300,
  w: 700,
  h: 520
};

const SECRET = {
  x: 1650,
  y: 950,
  w: 500,
  h: 420
};

const PASSWORD = process.env.FIGHT_PASSWORD || "hiddenfight";

const MAX_SPEED = 260;
const INVENTORY_LIMIT = 20;

function makePlayer(id) {
  return {
    id: id,
    name: "もふ" + Math.floor(Math.random() * 900 + 100),

    x: 560,
    y: 560,

    hp: 100,
    hunger: 100,

    coins: 50,

    level: 1,
    xp: 0,

    inventory: [
      {
        id: "riceball",
        name: "おにぎり",
        emoji: "🍙",
        qty: 2,
        type: "food",
        hunger: 25
      }
    ],

    fighting: false,
    fightUnlocked: false,

    alive: true,

    lifeId: 1,

    input: {
      x: 0,
      y: 0
    },

    lastAttack: 0,
    lastTick: Date.now()
  };
}

function initGrass() {
  for (let i = 0; i < 90; i++) {
    grasses.set("grass_" + i, {
      id: "grass_" + i,

      x: 180 + Math.random() * (WORLD.width - 360),
      y: 180 + Math.random() * (WORLD.height - 360),

      active: true,
      respawnAt: 0
    });
  }
}

initGrass();

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,

    x: p.x,
    y: p.y,

    hp: p.hp,
    hunger: p.hunger,

    coins: p.coins,

    level: p.level,
    xp: p.xp,

    fighting: p.fighting,
    fightUnlocked: p.fightUnlocked,

    alive: p.alive,
    lifeId: p.lifeId
  };
}

function inventoryCount(p) {
  return p.inventory.reduce((total, item) => {
    return total + item.qty;
  }, 0);
}

function addItem(p, item) {
  if (inventoryCount(p) + item.qty > INVENTORY_LIMIT) {
    return false;
  }

  const same = p.inventory.find(i => i.id === item.id);

  if (same) {
    same.qty += item.qty;
  } else {
    p.inventory.push({
      ...item
    });
  }

  return true;
}

function removeItem(p, itemId, qty) {
  const item = p.inventory.find(i => i.id === itemId);

  if (!item) {
    return null;
  }

  if (item.qty < qty) {
    return null;
  }

  item.qty -= qty;

  const result = {
    ...item,
    qty: qty
  };

  if (item.qty <= 0) {
    p.inventory = p.inventory.filter(i => i !== item);
  }

  return result;
}

function inRect(p, rect) {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.w &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.h
  );
}

function createDrop(
  ownerId,
  ownerLifeId,
  x,
  y,
  item,
  ttl,
  deathDrop
) {
  const id =
    "drop_" +
    Date.now() +
    "_" +
    Math.random().toString(36).slice(2);

  drops.set(id, {
    id: id,

    ownerId: ownerId,
    ownerLifeId: ownerLifeId,

    x: x,
    y: y,

    item: {
      ...item
    },

    expiresAt: Date.now() + ttl,

    deathDrop: !!deathDrop
  });
}

function resetAfterDeath(p) {
  p.lifeId++;

  p.hp = 100;
  p.hunger = 100;

  p.coins = 0;

  p.level = 1;
  p.xp = 0;

  p.inventory = [
    {
      id: "riceball",
      name: "おにぎり",
      emoji: "🍙",
      qty: 1,
      type: "food",
      hunger: 25
    }
  ];

  p.fighting = false;
}

function killPlayer(p) {
  if (!p.alive) {
    return;
  }

  p.alive = false;

  const items = p.inventory.map(item => {
    return {
      ...item
    };
  });

  for (const item of items) {
    createDrop(
      p.id,
      p.lifeId,

      p.x + Math.random() * 50 - 25,
      p.y + Math.random() * 50 - 25,

      item,

      20000,

      true
    );
  }

  resetAfterDeath(p);

  setTimeout(() => {
    if (!players.has(p.id)) {
      return;
    }

    p.x = 560;
    p.y = 560;

    p.alive = true;

    const playerSocket =
      io.sockets.sockets.get(p.id);

    if (playerSocket) {
      playerSocket.emit(
        "notice",
        "💀 倒されました。持ち物と生活データがリセットされました。"
      );

      playerSocket.emit(
        "inventory",
        p.inventory
      );
    }
  }, 1500);
}

function sendWorld() {
  const now = Date.now();

  for (const grass of grasses.values()) {
    if (
      !grass.active &&
      now >= grass.respawnAt
    ) {
      grass.active = true;

      grass.x =
        180 +
        Math.random() *
          (WORLD.width - 360);

      grass.y =
        180 +
        Math.random() *
          (WORLD.height - 360);
    }
  }

  for (const [id, drop] of drops) {
    if (now >= drop.expiresAt) {
      drops.delete(id);
    }
  }

  io.emit("world", {
    players: [...players.values()].map(
      publicPlayer
    ),

    drops: [...drops.values()],

    grasses: [...grasses.values()].filter(
      grass => grass.active
    ),

    world: WORLD,

    village: VILLAGE,

    secret: SECRET
  });
}

setInterval(() => {
  const now = Date.now();

  for (const p of players.values()) {
    if (!p.alive) {
      continue;
    }

    const dt = Math.min(
      0.05,
      (now - p.lastTick) / 1000
    );

    p.lastTick = now;

    let dx =
      Number(p.input.x) || 0;

    let dy =
      Number(p.input.y) || 0;

    const length =
      Math.hypot(dx, dy);

    if (length > 1) {
      dx /= length;
      dy /= length;
    }

    p.x = Math.max(
      20,
      Math.min(
        WORLD.width - 20,
        p.x +
          dx *
            MAX_SPEED *
            dt
      )
    );

    p.y = Math.max(
      20,
      Math.min(
        WORLD.height - 20,
        p.y +
          dy *
            MAX_SPEED *
            dt
      )
    );

    p.hunger = Math.max(
      0,
      p.hunger -
        dt * 0.45
    );

    if (p.hunger <= 0) {
      p.hp = Math.max(
        0,
        p.hp -
          dt * 3
      );
    }

    if (p.hp <= 0) {
      killPlayer(p);
    }
  }

  sendWorld();
}, 50);

io.on(
  "connection",
  socket => {
    const p =
      makePlayer(socket.id);

    players.set(
      socket.id,
      p
    );

    console.log(
      "Player connected:",
      socket.id
    );

    socket.emit(
      "init",
      {
        self:
          publicPlayer(p),

        inventory:
          p.inventory,

        message:
          "接続成功"
      }
    );

    socket.emit(
      "notice",
      "🏠 村へようこそ！ 草を刈ってお金を稼ごう。"
    );

    sendWorld();

    socket.on(
      "input",
      input => {
        if (
          !p.alive ||
          !input
        ) {
          return;
        }

        p.input = {
          x: Math.max(
            -1,
            Math.min(
              1,
              Number(input.x) || 0
            )
          ),

          y: Math.max(
            -1,
            Math.min(
              1,
              Number(input.y) || 0
            )
          )
        };
      }
    );

    socket.on(
      "inventoryRequest",
      () => {
        socket.emit(
          "inventory",
          p.inventory.map(
            item => ({
              ...item
            })
          )
        );
      }
    );

    socket.on(
      "grass",
      id => {
        const grass =
          grasses.get(id);

        if (
          !p.alive ||
          !grass ||
          !grass.active
        ) {
          return;
        }

        if (
          Math.hypot(
            p.x - grass.x,
            p.y - grass.y
          ) > 90
        ) {
          return;
        }

        grass.active = false;

        grass.respawnAt =
          Date.now() +
          15000;

        p.coins += 10;
        p.xp += 5;

        if (
          p.xp >=
          p.level * 40
        ) {
          p.xp = 0;
          p.level++;
        }

        addItem(
          p,
          {
            id: "weed",
            name: "草",
            emoji: "🌿",
            qty: 1,
            type: "material"
          }
        );

        socket.emit(
          "inventory",
          p.inventory
        );

        socket.emit(
          "notice",
          "🌱 草むしり成功！ +10コイン"
        );
      }
    );

    socket.on(
      "eat",
      itemId => {
        if (!p.alive) {
          return;
        }

        const item =
          p.inventory.find(
            i =>
              i.id === itemId
          );

        if (
          !item ||
          item.type !==
            "food"
        ) {
          return;
        }

        const eaten =
          removeItem(
            p,
            itemId,
            1
          );

        p.hunger =
          Math.min(
            100,
            p.hunger +
              (
                eaten.hunger ||
                20
              )
          );

        socket.emit(
          "inventory",
          p.inventory
        );

        socket.emit(
          "notice",
          eaten.emoji +
            " 食べた！"
        );
      }
    );

    socket.on(
      "drop",
      data => {
        if (
          !p.alive ||
          p.fighting
        ) {
          return;
        }

        const itemId =
          data &&
          data.itemId;

        const qty =
          Math.max(
            1,
            Math.floor(
              Number(
                data &&
                data.qty
              ) || 1
            )
          );

        const item =
          removeItem(
            p,
            itemId,
            qty
          );

        if (!item) {
          return;
        }

        createDrop(
          p.id,
          p.lifeId,

          p.x,
          p.y,

          item,

          60000,

          false
        );

        socket.emit(
          "inventory",
          p.inventory
        );
      }
    );

    socket.on(
      "pickup",
      id => {
        const drop =
          drops.get(id);

        if (
          !p.alive ||
          !drop
        ) {
          return;
        }

        if (
          Math.hypot(
            p.x - drop.x,
            p.y - drop.y
          ) > 105
        ) {
          return;
        }

        if (
          drop.deathDrop &&
          drop.ownerId === p.id
        ) {
          socket.emit(
            "notice",
            "💀 自分の死亡ドロップは回収できません。"
          );

          return;
        }

        if (
          !addItem(
            p,
            drop.item
          )
        ) {
          socket.emit(
            "notice",
            "🎒 インベントリがいっぱい！"
          );

          return;
        }

        drops.delete(id);

        socket.emit(
          "inventory",
          p.inventory
        );
      }
    );

    socket.on(
      "unlockFight",
      password => {
        if (
          String(password) !==
          PASSWORD
        ) {
          socket.emit(
            "notice",
            "パスワードが違います。"
          );

          return;
        }

        p.fightUnlocked =
          true;

        socket.emit(
          "notice",
          "🔓 裏格闘が解放された！"
        );
      }
    );

    socket.on(
      "toggleFight",
      () => {
        if (
          !p.alive ||
          !p.fightUnlocked
        ) {
          return;
        }

        if (
          !inRect(
            p,
            SECRET
          )
        ) {
          socket.emit(
            "notice",
            "🕳️ 裏格闘場の中でのみ使えます。"
          );

          return;
        }

        p.fighting =
          !p.fighting;

        socket.emit(
          "notice",
          p.fighting
            ? "⚔️ 裏格闘モード ON"
            : "🕊️ 裏格闘モード OFF"
        );
      }
    );

    socket.on(
      "attack",
      () => {
        if (
          !p.alive ||
          !p.fighting ||
          !inRect(
            p,
            SECRET
          )
        ) {
          return;
        }

        const now =
          Date.now();

        if (
          now -
            p.lastAttack <
          550
        ) {
          return;
        }

        p.lastAttack =
          now;

        for (
          const target of
          players.values()
        ) {
          if (
            target.id ===
              p.id ||
            !target.alive
          ) {
            continue;
          }

          if (
            !target.fighting ||
            !inRect(
              target,
              SECRET
            )
          ) {
            continue;
          }

          if (
            Math.hypot(
              p.x -
                target.x,
              p.y -
                target.y
            ) <= 105
          ) {
            target.hp =
              Math.max(
                0,
                target.hp -
                  20
              );

            if (
              target.hp <=
              0
            ) {
              killPlayer(
                target
              );
            }
          }
        }
      }
    );

    socket.on(
      "shopFood",
      () => {
        if (
          !p.alive
        ) {
          return;
        }

        if (
          Math.hypot(
            p.x - 740,
            p.y - 430
          ) > 120
        ) {
          socket.emit(
            "notice",
            "🍙 食べ物屋の近くで購入してください。"
          );

          return;
        }

        if (
          p.coins <
          15
        ) {
          socket.emit(
            "notice",
            "💰 コインが足りません。"
          );

          return;
        }

        const success =
          addItem(
            p,
            {
              id:
                "riceball",

              name:
                "おにぎり",

              emoji:
                "🍙",

              qty: 1,

              type:
                "food",

              hunger:
                25
            }
          );

        if (!success) {
          socket.emit(
            "notice",
            "🎒 インベントリがいっぱい！"
          );

          return;
        }

        p.coins -= 15;

        socket.emit(
          "inventory",
          p.inventory
        );

        socket.emit(
          "notice",
          "🍙 おにぎりを買いました！"
        );
      }
    );

    socket.on(
      "disconnect",
      () => {
        console.log(
          "Player disconnected:",
          socket.id
        );

        players.delete(
          socket.id
        );
      }
    );
  }
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "Server running on " +
      PORT
    );
  }
);
