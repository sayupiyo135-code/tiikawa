const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true
});

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const stats = document.getElementById("stats");
const panel = document.getElementById("panel");
const toast = document.getElementById("toast");

const inventoryBtn =
  document.getElementById("inventoryBtn");

const fightBtn =
  document.getElementById("fightBtn");

const attackBtn =
  document.getElementById("attackBtn");

const actionBtn =
  document.getElementById("actionBtn");

const stick =
  document.getElementById("stick");

const knob =
  document.getElementById("knob");


let self = null;

let myInventory = [];

let selectedItem = null;
let selectedDrop = null;

let world = {
  players: [],
  drops: [],
  grasses: [],

  world: {
    width: 2400,
    height: 1600
  },

  village: {
    x: 300,
    y: 300,
    w: 700,
    h: 520
  },

  secret: {
    x: 1650,
    y: 950,
    w: 500,
    h: 420
  }
};


function resize() {
  const dpr =
    window.devicePixelRatio || 1;

  canvas.width =
    Math.floor(
      window.innerWidth * dpr
    );

  canvas.height =
    Math.floor(
      window.innerHeight * dpr
    );

  canvas.style.width =
    window.innerWidth + "px";

  canvas.style.height =
    window.innerHeight + "px";

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );
}

window.addEventListener(
  "resize",
  resize
);

resize();


function showToast(message) {
  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(() => {
      toast.classList.remove(
        "show"
      );
    }, 2200);
}


socket.on(
  "connect",
  () => {
    showToast(
      "🌐 オンライン接続成功！"
    );
  }
);


socket.on(
  "connect_error",
  error => {
    console.error(
      "Socket connect error:",
      error
    );

    showToast(
      "⚠️ 接続中..."
    );
  }
);


socket.on(
  "disconnect",
  () => {
    showToast(
      "⚠️ 接続が切れました。再接続中..."
    );
  }
);


socket.on(
  "init",
  data => {
    self =
      data.self;

    myInventory =
      Array.isArray(
        data.inventory
      )
        ? data.inventory
        : [];

    updateHUD();
  }
);


socket.on(
  "inventory",
  inventory => {
    myInventory =
      Array.isArray(
        inventory
      )
        ? inventory
        : [];

    if (
      !panel.classList.contains(
        "hidden"
      )
    ) {
      openInventory();
    }
  }
);


socket.on(
  "world",
  data => {
    world =
      data;

    if (self) {
      const updated =
        world.players.find(
          player =>
            player.id ===
            self.id
        );

      if (updated) {
        self =
          updated;
      }
    }

    updateHUD();
  }
);


socket.on(
  "notice",
  message => {
    showToast(
      message
    );
  }
);


function updateHUD() {
  if (!self) {
    stats.innerHTML =
      "🌐 接続中...";

    return;
  }

  stats.innerHTML =
    "❤️ " +
    Math.ceil(
      self.hp
    ) +
    "　🍙 " +
    Math.ceil(
      self.hunger
    ) +
    "<br>" +
    "💰 " +
    self.coins +
    "　⭐ Lv." +
    self.level;

  fightBtn.classList.toggle(
    "hidden",
    !self.fightUnlocked
  );

  if (self.fighting) {
    fightBtn.textContent =
      "🕊️ 格闘OFF";
  } else {
    fightBtn.textContent =
      "⚔️ 格闘ON";
  }
}


function isNear(
  entity,
  range = 100
) {
  if (
    !self ||
    !entity
  ) {
    return false;
  }

  return (
    Math.hypot(
      self.x - entity.x,
      self.y - entity.y
    ) <= range
  );
}


inventoryBtn.addEventListener(
  "click",
  () => {
    openInventory();
  }
);


fightBtn.addEventListener(
  "click",
  () => {
    socket.emit(
      "toggleFight"
    );
  }
);


attackBtn.addEventListener(
  "click",
  () => {
    socket.emit(
      "attack"
    );
  }
);


actionBtn.addEventListener(
  "click",
  () => {
    if (!self) {
      return;
    }

    const grass =
      world.grasses.find(
        item =>
          isNear(
            item,
            90
          )
      );

    if (grass) {
      socket.emit(
        "grass",
        grass.id
      );

      return;
    }

    const shop = {
      x: 740,
      y: 430
    };

    if (
      isNear(
        shop,
        120
      )
    ) {
      socket.emit(
        "shopFood"
      );

      return;
    }

    showToast(
      "近くに作業できるものがありません"
    );
  }
);


function escapeHtml(text) {
  return String(text)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    );
}


function openInventory() {
  const nearbyDrops =
    world.drops.filter(
      drop =>
        isNear(
          drop,
          105
        )
    );

  panel.classList.remove(
    "hidden"
  );


  let inventoryHTML =
    "";

  if (
    myInventory.length >
    0
  ) {
    for (
      const item of
      myInventory
    ) {
      const selected =
        selectedItem ===
        item.id
          ? "selected"
          : "";

      let eatButton =
        "";

      if (
        item.type ===
        "food"
      ) {
        eatButton =
          `<button onclick="event.stopPropagation();eatItem('${item.id}')">食べる</button>`;
      }

      inventoryHTML +=
        `
        <div
          class="row item ${selected}"
          onclick="selectItem('${item.id}')"
        >
          <span>
            ${escapeHtml(item.emoji)}
            ${escapeHtml(item.name)}
            ×${item.qty}
          </span>

          ${eatButton}
        </div>
        `;
    }
  } else {
    inventoryHTML =
      "<p>何も持っていません</p>";
  }


  let dropsHTML =
    "";

  if (
    nearbyDrops.length >
    0
  ) {
    for (
      const drop of
      nearbyDrops
    ) {
      const selected =
        selectedDrop ===
        drop.id
          ? "selected"
          : "";

      dropsHTML +=
        `
        <div
          class="row item ${selected}"
          onclick="selectDrop('${drop.id}')"
        >
          <span>
            ${escapeHtml(
              drop.item.emoji
            )}
            ${escapeHtml(
              drop.item.name
            )}
            ×${drop.item.qty}
          </span>
        </div>
        `;
    }
  } else {
    dropsHTML =
      "<p>近くにありません</p>";
  }


  panel.innerHTML =
    `
    <button
      class="close"
      onclick="closePanel()"
    >
      ✕
    </button>

    <h2>
      🎒 インベントリ
    </h2>

    <div class="section">
      持ち物
    </div>

    ${inventoryHTML}

    <button
      class="danger"
      onclick="dropItem()"
    >
      ⬇ ドロップ
    </button>

    <div class="section">
      📦 近くのドロップ
    </div>

    ${dropsHTML}

    <button
      class="near"
      onclick="pickupItem()"
    >
      📥 回収
    </button>

    <hr>

    <button
      onclick="unlockFight()"
    >
      🔐 裏格闘パスワード
    </button>
    `;
}


window.closePanel =
  function () {
    panel.classList.add(
      "hidden"
    );
  };


window.selectItem =
  function (id) {
    selectedItem =
      id;

    openInventory();
  };


window.selectDrop =
  function (id) {
    selectedDrop =
      id;

    openInventory();
  };


window.eatItem =
  function (id) {
    socket.emit(
      "eat",
      id
    );
  };


window.dropItem =
  function () {
    if (
      !selectedItem
    ) {
      showToast(
        "ドロップするアイテムを選択してね"
      );

      return;
    }

    socket.emit(
      "drop",
      {
        itemId:
          selectedItem,

        qty:
          1
      }
    );

    selectedItem =
      null;
  };


window.pickupItem =
  function () {
    if (
      !selectedDrop
    ) {
      showToast(
        "回収するアイテムを選択してね"
      );

      return;
    }

    socket.emit(
      "pickup",
      selectedDrop
    );

    selectedDrop =
      null;
  };


window.unlockFight =
  function () {
    const password =
      prompt(
        "秘密のパスワード"
      );

    if (
      password !==
      null
    ) {
      socket.emit(
        "unlockFight",
        password
      );
    }
  };


function draw() {
  requestAnimationFrame(
    draw
  );

  ctx.clearRect(
    0,
    0,
    window.innerWidth,
    window.innerHeight
  );


  if (!self) {
    ctx.fillStyle =
      "#bfe9ff";

    ctx.fillRect(
      0,
      0,
      window.innerWidth,
      window.innerHeight
    );

    ctx.fillStyle =
      "#222";

    ctx.font =
      "bold 24px sans-serif";

    ctx.fillText(
      "オンライン接続中...",
      24,
      90
    );

    return;
  }


  const camX =
    self.x -
    window.innerWidth / 2;

  const camY =
    self.y -
    window.innerHeight / 2;


  ctx.save();

  ctx.translate(
    -camX,
    -camY
  );


  ctx.fillStyle =
    "#9bdd77";

  ctx.fillRect(
    0,
    0,
    world.world.width,
    world.world.height
  );


  const village =
    world.village;

  ctx.fillStyle =
    "#ead2a8";

  ctx.fillRect(
    village.x,
    village.y,
    village.w,
    village.h
  );

  ctx.fillStyle =
    "#222";

  ctx.font =
    "bold 20px sans-serif";

  ctx.fillText(
    "🏠 村",
    village.x + 20,
    village.y + 35
  );


  const secret =
    world.secret;

  ctx.fillStyle =
    "#76523b";

  ctx.fillRect(
    secret.x,
    secret.y,
    secret.w,
    secret.h
  );

  ctx.fillStyle =
    "#fff";

  ctx.fillText(
    "🕳️ 裏格闘場",
    secret.x + 20,
    secret.y + 35
  );


  ctx.font =
    "42px sans-serif";

  ctx.fillText(
    "🍙",
    710,
    445
  );

  ctx.fillStyle =
    "#222";

  ctx.font =
    "16px sans-serif";

  ctx.fillText(
    "食べ物屋 (+おにぎり 15💰)",
    660,
    485
  );


  ctx.font =
    "24px sans-serif";

  for (
    const grass of
    world.grasses
  ) {
    ctx.fillText(
      "🌱",
      grass.x - 12,
      grass.y + 8
    );
  }


  for (
    const drop of
    world.drops
  ) {
    ctx.font =
      "25px sans-serif";

    ctx.fillText(
      drop.item.emoji,
      drop.x - 12,
      drop.y + 8
    );

    ctx.fillStyle =
      "#222";

    ctx.font =
      "11px sans-serif";

    const seconds =
      Math.max(
        0,
        Math.ceil(
          (
            drop.expiresAt -
            Date.now()
          ) /
          1000
        )
      );

    ctx.fillText(
      seconds + "秒",
      drop.x - 12,
      drop.y + 24
    );
  }


  for (
    const player of
    world.players
  ) {
    ctx.beginPath();

    ctx.fillStyle =
      player.fighting
        ? "#ff6b6b"
        : "#ffffff";

    ctx.arc(
      player.x,
      player.y,
      20,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.strokeStyle =
      "#222";

    ctx.lineWidth =
      2;

    ctx.stroke();


    ctx.fillStyle =
      "#222";

    ctx.font =
      "14px sans-serif";

    ctx.fillText(
      (
        player.fighting
          ? "⚔️ "
          : ""
      ) +
      player.name,

      player.x - 28,
      player.y - 30
    );


    ctx.fillStyle =
      "#e44";

    ctx.fillRect(
      player.x - 22,
      player.y + 27,
      44,
      5
    );

    ctx.fillStyle =
      "#4c4";

    ctx.fillRect(
      player.x - 22,
      player.y + 27,
      44 *
        (
          player.hp /
          100
        ),
      5
    );
  }


  ctx.restore();
}


draw();


// タブレット用スティック

let joystickActive =
  false;


function setJoystick(
  clientX,
  clientY
) {
  const rect =
    stick.getBoundingClientRect();

  const centerX =
    rect.left +
    rect.width / 2;

  const centerY =
    rect.top +
    rect.height / 2;


  let dx =
    clientX -
    centerX;

  let dy =
    clientY -
    centerY;


  const max =
    38;

  const length =
    Math.hypot(
      dx,
      dy
    );


  if (
    length >
    max
  ) {
    dx =
      dx /
      length *
      max;

    dy =
      dy /
      length *
      max;
  }


  knob.style.left =
    36 +
    dx +
    "px";

  knob.style.top =
    36 +
    dy +
    "px";


  socket.emit(
    "input",
    {
      x:
        dx / max,

      y:
        dy / max
    }
  );
}


stick.addEventListener(
  "pointerdown",
  event => {
    joystickActive =
      true;

    stick.setPointerCapture(
      event.pointerId
    );

    setJoystick(
      event.clientX,
      event.clientY
    );
  }
);


stick.addEventListener(
  "pointermove",
  event => {
    if (
      joystickActive
    ) {
      setJoystick(
        event.clientX,
        event.clientY
      );
    }
  }
);


function stopJoystick() {
  joystickActive =
    false;

  knob.style.left =
    "36px";

  knob.style.top =
    "36px";

  socket.emit(
    "input",
    {
      x: 0,
      y: 0
    }
  );
}


stick.addEventListener(
  "pointerup",
  stopJoystick
);

stick.addEventListener(
  "pointercancel",
  stopJoystick
);


// PCキーボード操作

const keys = {};


window.addEventListener(
  "keydown",
  event => {
    keys[
      event.key.toLowerCase()
    ] =
      true;


    if (
      event.key.toLowerCase() ===
      "i"
    ) {
      openInventory();
    }


    if (
      event.key ===
      " "
    ) {
      event.preventDefault();

      socket.emit(
        "attack"
      );
    }
  }
);


window.addEventListener(
  "keyup",
  event => {
    keys[
      event.key.toLowerCase()
    ] =
      false;
  }
);


setInterval(
  () => {
    if (
      joystickActive
    ) {
      return;
    }


    const x =
      (
        keys["d"] ||
        keys["arrowright"]
          ? 1
          : 0
      ) -
      (
        keys["a"] ||
        keys["arrowleft"]
          ? 1
          : 0
      );


    const y =
      (
        keys["s"] ||
        keys["arrowdown"]
          ? 1
          : 0
      ) -
      (
        keys["w"] ||
        keys["arrowup"]
          ? 1
          : 0
      );


    socket.emit(
      "input",
      {
        x: x,
        y: y
      }
    );
  },
  60
);
