// modules/treasure-lock/module.js
Hooks.once('canvasReady', async () => {
  const ws = new WebSocket("ws://localhost:8765");
  const tiles = {};
  const proximityBars = {};
  let difficulty = 3;
  let lockedCount = 0;

  ws.onopen = () => {
    console.log("[LockModule] Connexion WebSocket ouverte");
    ws.send(JSON.stringify({ event: "reset" }));
    ws.send(JSON.stringify({ event: "start", payload: { difficulty } }));
  };

  ws.onmessage = async (message) => {
    const data = JSON.parse(message.data);
    switch (data.event) {
      case "setup":
        difficulty = data.payload.difficulty || 3;
        await createTreasureScene(difficulty);
        break;

      case "proximity":
        updateProximity(data.payload.index, data.payload.value);
        break;

      case "unlock":
        toggleLockState(data.payload.index);
        break;

      case "victory":
        unlockChest();
        break;
    }
  };

  async function createTreasureScene(difficulty) {
    const scene = game.scenes.find(s => s.name === "TreasureChest") || await Scene.create({ name: "TreasureChest" });
    await scene.activate();

    const basePath = "modules/treasure-lock/assets/";
    const tilesToCreate = [
      { id: "chest-closed", img: basePath + "chest-closed.png" },
      { id: "chest-open", img: basePath + "chest-open.gif", hidden: true },
      { id: "lock", img: basePath + "lock.png" },
      ...Array.from({ length: 3 }, (_, i) => ({ id: `lock-${i}`, img: basePath + `pin-${i}-locked.png`, hidden: i >= difficulty })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `unlocked-${i}`, img: basePath + `pin-${i}-unlocked.png`, hidden: true }))
    ];

    const created = await scene.createEmbeddedDocuments("Tile", tilesToCreate.map(t => ({
      img: t.img,
      x: 200 + 50 * Math.random(),
      y: 200 + 50 * Math.random(),
      hidden: t.hidden || false,
      flags: { "treasure-lock": { id: t.id } }
    })));

    created.forEach(t => tiles[t.getFlag("treasure-lock", "id")] = t);
  }

  function updateProximity(index, value) {
    let bar = proximityBars[index];
    if (!bar) {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.bottom = `${10 + index * 25}px`;
      div.style.left = '10px';
      div.style.width = '200px';
      div.style.height = '20px';
      div.style.background = '#333';
      div.style.border = '1px solid #999';

      const fill = document.createElement('div');
      fill.style.height = '100%';
      fill.style.width = '0%';
      fill.style.background = 'lime';
      div.appendChild(fill);

      document.body.appendChild(div);
      proximityBars[index] = fill;
    }
    proximityBars[index].style.width = `${Math.min(value, 255) / 255 * 100}%`;
  }

  async function toggleLockState(index) {
    const locked = tiles[`lock-${index}`];
    const unlocked = tiles[`unlocked-${index}`];
    if (locked) await locked.update({ hidden: true });
    if (unlocked) await unlocked.update({ hidden: false });
    AudioHelper.play({ src: "modules/treasure-lock/sounds/unlock.mp3" }, true);
    lockedCount++;
  }

  async function unlockChest() {
    if (tiles["chest-closed"]) await tiles["chest-closed"].update({ hidden: true });
    if (tiles["chest-open"]) await tiles["chest-open"].update({ hidden: false });
    Object.values(tiles).forEach(async t => {
      if (t.id.startsWith("lock") || t.id.startsWith("unlocked")) {
        await t.update({ hidden: true });
      }
    });
    AudioHelper.play({ src: "modules/treasure-lock/sounds/open.mp3" }, true);

    setTimeout(() => {
      ui.notifications.info("🎁 Vous découvrez le contenu du coffre !");
      createResetTile();
    }, 3000);
  }

  async function createResetTile() {
    const img = "modules/treasure-lock/assets/reset.png";
    const scene = canvas.scene;
    const reset = await scene.createEmbeddedDocuments("Tile", [{
      img,
      x: 300,
      y: 100,
      flags: { "treasure-lock": { id: "reset-tile" } }
    }]);

    reset[0].sheet?.render(true);
    reset[0].document?.setFlag("core", "overlay", true);
    reset[0].document?.update({ hidden: false });

    Hooks.once("clickTile", t => {
      if (t.getFlag("treasure-lock", "id") === "reset-tile") location.reload();
    });
  }
});
