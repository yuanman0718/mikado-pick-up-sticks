(() => {
  "use strict";

  const canvas = document.getElementById("sceneCanvas");
  const ctx = canvas.getContext("2d");
  const scene = document.getElementById("scene");
  const guideTitle = document.getElementById("guideTitle");
  const guideText = document.getElementById("guideText");
  const scoreValue = document.getElementById("scoreValue");
  const timeValue = document.getElementById("timeValue");
  const timeRule = document.getElementById("timeRule");
  const timeRuleFill = document.getElementById("timeRuleFill");
  const hoverTag = document.getElementById("hoverTag");
  const toast = document.getElementById("toast");
  const tutorialOverlay = document.getElementById("tutorialOverlay");
  const result = document.getElementById("result");
  const resultReason = document.getElementById("resultReason");
  const resultScore = document.getElementById("resultScore");
  const resultMeta = document.getElementById("resultMeta");
  const resultBest = document.getElementById("resultBest");
  const soundButton = document.getElementById("soundButton");

  const TOTAL_STICKS = 35;
  const START_TIME = 75;
  const MAX_LIVES = 3;
  const TAU = Math.PI * 2;
  const CONTACT_PADDING = 1.8;

  const kinds = [
    { key: "black", name: "MIKADO", count: 1, value: 20, color: "#20221f", accent: "#cdb04b" },
    { key: "blue", name: "BLUE", count: 5, value: 10, color: "#3a91b0", accent: "#81c8dc" },
    { key: "red", name: "RED", count: 7, value: 5, color: "#d9624e", accent: "#eca28f" },
    { key: "yellow", name: "YELLOW", count: 9, value: 3, color: "#e8bf43", accent: "#f5df8c" },
    { key: "plain", name: "WOOD", count: 13, value: 1, color: "#b88956", accent: "#d8b17d" },
  ];

  const state = {
    mode: "closed",
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: 1,
    lid: 0,
    lidTarget: 0,
    lidDrag: null,
    touchPointers: new Map(),
    pinch: null,
    openPress: null,
    handEnterAt: 0,
    bundlePress: null,
    cameraDrag: null,
    camera: { yaw: -0.06, pitch: 0.72 },
    zoom: 1,
    zoomTarget: 1,
    selected: null,
    dragStart: null,
    dragPull: 0,
    hovered: null,
    blockedEffect: null,
    inputLock: 0,
    lastTime: 0,
    secondStamp: -1,
    paused: false,
    soundOn: readSoundPreference(),
    audio: null,
    slideAudio: null,
    slideVelocity: 0,
    slideLastY: 0,
    slideTravel: 0,
    music: null,
    boxRect: null,
    boxSticks: [],
    sticks: [],
    scatterStart: 0,
    scatterSpin: [],
    score: 0,
    best: readBest(),
    lives: MAX_LIVES,
    timeLeft: START_TIME,
    picked: 0,
    misses: 0,
    combo: 0,
    maxCombo: 0,
    round: 0,
    startBest: 0,
    floaters: [],
    particles: [],
    toastTimer: 0,
  };

  function readBest() {
    try {
      return Number(localStorage.getItem("mikado-minimal-best") || 0);
    } catch {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem("mikado-minimal-best", String(state.best));
    } catch {
      // The game still works when local storage is unavailable.
    }
  }

  function readSoundPreference() {
    try {
      return localStorage.getItem("mikado-minimal-sound") !== "off";
    } catch {
      return true;
    }
  }

  function saveSoundPreference() {
    try {
      localStorage.setItem("mikado-minimal-sound", state.soundOn ? "on" : "off");
    } catch {
      // Session-only preference is sufficient.
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  }

  function easeInOutCubic(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function mulberry32(seed) {
    return function random() {
      let value = (seed += 0x6D2B79F5);
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random) {
    const resultItems = [...items];
    for (let index = resultItems.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [resultItems[index], resultItems[swap]] = [resultItems[swap], resultItems[index]];
    }
    return resultItems;
  }

  function randomBetween(min, max, random = Math.random) {
    return min + (max - min) * random();
  }

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
  }

  function createColorBands(kind, length, random) {
    if (kind.key === "plain") {
      return [{ offset: 0, width: 0, color: kind.color }];
    }
    const count = kind.key === "black" ? 5 : Math.floor(randomBetween(3, 6, random));
    const gap = kind.key === "black" ? 12 : randomBetween(9, 14, random);
    const width = kind.key === "black" ? 5.5 : randomBetween(4, 6, random);
    const center = randomBetween(-length * 0.14, length * 0.14, random);
    const bands = [];
    for (let index = 0; index < count; index += 1) {
      bands.push({
        offset: center + (index - (count - 1) / 2) * gap,
        width,
        color: kind.color,
      });
    }
    if (kind.key === "black") {
      bands.unshift({ offset: center - gap * 3.5, width: 3, color: kind.accent });
      bands.push({ offset: center + gap * 3.5, width: 3, color: kind.accent });
    }
    return bands;
  }

  function buildBoxSticks() {
    const random = mulberry32(Date.now() + state.round * 109);
    state.boxSticks = Array.from({ length: TOTAL_STICKS }, (_, index) => {
      const kind = kinds[index === 0 ? 0 : 1 + Math.floor(random() * (kinds.length - 1))];
      return {
        id: index,
        kind,
        x: randomBetween(0.06, 0.94, random),
        tilt: randomBetween(-0.018, 0.018, random),
        start: randomBetween(0.03, 0.08, random),
        end: randomBetween(0.92, 0.98, random),
        bands: createColorBands(kind, 400, random),
      };
    });
  }

  function buildTableSticks() {
    const random = mulberry32(Date.now() + 609 + state.round * 187);
    const bag = kinds.flatMap((kind) => Array.from({ length: kind.count }, () => kind));
    const randomizedKinds = shuffle(bag, random);
    const profileRoll = random();
    const scatterProfile = profileRoll < 0.4
      ? { key: "compact", radiusX: 220, radiusY: 98, weight: 0.7, offsetX: 34, offsetY: 22 }
      : profileRoll < 0.78
        ? { key: "balanced", radiusX: 305, radiusY: 158, weight: 0.82, offsetX: 56, offsetY: 34 }
        : { key: "open", radiusX: 400, radiusY: 220, weight: 0.95, offsetX: 78, offsetY: 46 };
    state.scatterProfile = scatterProfile;
    const centerX = randomBetween(-scatterProfile.offsetX, scatterProfile.offsetX, random);
    const centerY = randomBetween(-scatterProfile.offsetY, scatterProfile.offsetY, random);
    state.sticks = randomizedKinds.map((kind, index) => {
      const distance = Math.pow(random(), scatterProfile.weight);
      const scatterAngle = random() * TAU;
      const length = randomBetween(232, 322, random);
      const angle = randomBetween(-Math.PI * 0.96, Math.PI * 0.96, random);
      return {
        id: index,
        kind,
        x: centerX + Math.cos(scatterAngle) * distance * scatterProfile.radiusX,
        y: centerY + Math.sin(scatterAngle) * distance * scatterProfile.radiusY,
        originX: 0,
        originY: 0,
        angle,
        finalAngle: angle,
        length,
        radius: randomBetween(4.7, 6.2, random),
        z: index + randomBetween(0, 0.1, random),
        bands: createColorBands(kind, length, random),
        visible: true,
        removed: false,
        selected: false,
        wobble: 0,
        wobblePhase: random() * TAU,
        spin: randomBetween(-2.2, 2.2, random),
        flight: randomBetween(40, 175, random),
        startX: randomBetween(-22, 22, random),
        startY: randomBetween(-30, 20, random),
      };
    });
    state.sticks.forEach((stick) => {
      stick.originX = stick.x;
      stick.originY = stick.y;
    });
    state.sticks.sort((a, b) => a.z - b.z);
    state.sticks.forEach((stick, index) => {
      stick.stackHeight = 1.5 + Math.pow(index / Math.max(1, state.sticks.length - 1), 0.82) * 18;
      stick.thickness = stick.radius * 1.55;
    });
  }

  function cameraSetup() {
    const pitch = state.camera.pitch;
    const yaw = state.camera.yaw;
    const baseFocal = state.width < 700
      ? Math.min(state.width * 1.55, state.height * 1.18)
      : Math.min(state.width * 1.26, state.height * 1.38);
    return {
      yaw,
      pitch,
      cosYaw: Math.cos(yaw),
      sinYaw: Math.sin(yaw),
      cosPitch: Math.cos(pitch),
      sinPitch: Math.sin(pitch),
      focal: clamp(baseFocal, 380, 1520) * state.zoom,
      distance: 1200,
      height: 940,
      centerX: state.width * 0.5,
      centerY: state.height * 0.57,
    };
  }

  function project(x, y, z = 0, setup = cameraSetup()) {
    const x1 = x * setup.cosYaw - y * setup.sinYaw;
    const y1 = x * setup.sinYaw + y * setup.cosYaw;
    const cameraHeight = setup.height - z;
    const depth = (y1 + setup.distance) * setup.cosPitch + cameraHeight * setup.sinPitch;
    const vertical = (y1 + setup.distance) * setup.sinPitch - cameraHeight * setup.cosPitch;
    const originDepth = setup.distance * setup.cosPitch + setup.height * setup.sinPitch;
    const originVertical = setup.distance * setup.sinPitch - setup.height * setup.cosPitch;
    return {
      x: setup.centerX + setup.focal * x1 / depth,
      y: setup.centerY - setup.focal * (vertical / depth - originVertical / originDepth),
      scale: setup.focal / depth,
    };
  }

  function getBoxLayout() {
    const availableHeight = state.height - (state.width < 700 ? 205 : 230);
    const boxHeight = clamp(availableHeight, state.width < 700 ? 250 : 310, 610);
    const boxWidth = boxHeight * 0.37;
    const x = (state.width - boxWidth) / 2;
    const y = Math.max(82, (state.height - boxHeight) * 0.5 - 14);
    return { x, y, width: boxWidth, height: boxHeight };
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawWoodGrain(x, y, width, height, horizontal = false) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.lineWidth = 0.7;
    if (horizontal) {
      for (let lineY = y + 9; lineY < y + height; lineY += 15) {
        ctx.strokeStyle = lineY % 3 === 0 ? "rgba(100, 62, 25, 0.055)" : "rgba(255, 245, 215, 0.12)";
        ctx.beginPath();
        for (let lineX = x - 10; lineX <= x + width + 10; lineX += 12) {
          const wave = Math.sin(lineX * 0.035 + lineY * 0.08) * 2.2 + Math.sin(lineX * 0.11) * 0.7;
          if (lineX === x - 10) ctx.moveTo(lineX, lineY + wave);
          else ctx.lineTo(lineX, lineY + wave);
        }
        ctx.stroke();
      }
    } else {
      for (let lineX = x + 10; lineX < x + width; lineX += 18) {
        ctx.strokeStyle = lineX % 5 < 2 ? "rgba(99, 61, 27, 0.05)" : "rgba(255, 246, 218, 0.1)";
        ctx.beginPath();
        for (let lineY = y - 10; lineY <= y + height + 10; lineY += 14) {
          const wave = Math.sin(lineY * 0.035 + lineX * 0.07) * 2 + Math.sin(lineY * 0.09) * 0.7;
          if (lineY === y - 10) ctx.moveTo(lineX + wave, lineY);
          else ctx.lineTo(lineX + wave, lineY);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawBoxBase(box, now) {
    const { x, y, width, height } = box;

    ctx.save();
    ctx.shadowColor = "rgba(55, 38, 18, 0.2)";
    ctx.shadowBlur = 38;
    ctx.shadowOffsetX = 16;
    ctx.shadowOffsetY = 24;
    roundedRect(ctx, x, y, width, height, 3);
    ctx.fillStyle = "#9b6b3d";
    ctx.fill();
    ctx.restore();

    // Solid right and bottom faces establish the thickness of the wooden tray.
    ctx.fillStyle = "#8b5c33";
    ctx.beginPath();
    ctx.moveTo(x + width, y + 5);
    ctx.lineTo(x + width + 10, y + 13);
    ctx.lineTo(x + width + 10, y + height + 8);
    ctx.lineTo(x + width, y + height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a97949";
    ctx.beginPath();
    ctx.moveTo(x + 3, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width + 10, y + height + 8);
    ctx.lineTo(x + 13, y + height + 10);
    ctx.closePath();
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(x, y, x + width, y + height);
    bodyGradient.addColorStop(0, "#eccd97");
    bodyGradient.addColorStop(0.47, "#dbb277");
    bodyGradient.addColorStop(1, "#c28e55");
    roundedRect(ctx, x, y, width, height, 3);
    ctx.fillStyle = bodyGradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(78, 47, 19, 0.42)";
    ctx.lineWidth = 1;
    ctx.stroke();
    drawWoodGrain(x, y, width, height);

    const inset = clamp(width * 0.085, 12, 21);
    roundedRect(ctx, x + inset, y + inset, width - inset * 2, height - inset * 2, 1);
    ctx.fillStyle = "#e7d0aa";
    ctx.fill();
    ctx.strokeStyle = "rgba(102, 66, 29, 0.3)";
    ctx.stroke();

    ctx.save();
    roundedRect(ctx, x + inset + 2, y + inset + 2, width - inset * 2 - 4, height - inset * 2 - 4, 1);
    ctx.clip();
    const cavity = ctx.createLinearGradient(x, y, x + width, y + height);
    cavity.addColorStop(0, "rgba(255, 247, 222, 0.7)");
    cavity.addColorStop(1, "rgba(126, 80, 35, 0.12)");
    ctx.fillStyle = cavity;
    ctx.fillRect(x, y, width, height);
    drawBoxSticks(x, y, width, height, now);
    ctx.restore();

    // Raised inner wall.
    ctx.save();
    ctx.shadowColor = "rgba(83, 49, 18, 0.18)";
    ctx.shadowBlur = 7;
    roundedRect(ctx, x + inset, y + inset, width - inset * 2, height - inset * 2, 1);
    ctx.strokeStyle = "rgba(111, 72, 34, 0.26)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 245, 219, 0.34)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + inset + 2, y + height - inset);
    ctx.lineTo(x + width - inset, y + height - inset);
    ctx.stroke();

    ctx.fillStyle = "rgba(74, 43, 19, 0.28)";
    ctx.fillRect(x + width * 0.4, y + height - inset - 6, width * 0.2, 2);
  }

  function taperedStickPath(x1, y1, x2, y2, width) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const tip = Math.min(width * 3.4, length * 0.16);
    const half = width * 0.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ux * tip + nx * half, y1 + uy * tip + ny * half);
    ctx.lineTo(x2 - ux * tip + nx * half, y2 - uy * tip + ny * half);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - ux * tip - nx * half, y2 - uy * tip - ny * half);
    ctx.lineTo(x1 + ux * tip - nx * half, y1 + uy * tip - ny * half);
    ctx.closePath();
  }

  function drawBoxSticks(x, y, width, height) {
    const inset = clamp(width * 0.085, 12, 21);
    const innerX = x + inset + clamp(width * 0.035, 7, 12);
    const innerY = y + inset + clamp(width * 0.04, 8, 13);
    const innerW = width - (innerX - x) * 2;
    const innerH = height - (innerY - y) * 2;

    for (const stick of state.boxSticks) {
      const stickX = innerX + stick.x * innerW;
      const tilt = stick.tilt * innerH;
      const y1 = innerY + stick.start * innerH;
      const y2 = innerY + stick.end * innerH;
      const x1 = stickX + tilt * 0.5;
      const x2 = stickX - tilt * 0.5;
      const lineWidth = clamp(width * 0.017, 3.2, 5);

      taperedStickPath(x1 + 2, y1 + 3, x2 + 2, y2 + 3, lineWidth + 1.4);
      ctx.fillStyle = "rgba(86, 53, 22, 0.13)";
      ctx.fill();

      const wood = ctx.createLinearGradient(x1, y1, x2, y2);
      wood.addColorStop(0, "#f2dba9");
      wood.addColorStop(0.55, "#e9c88f");
      wood.addColorStop(1, "#c7985d");
      taperedStickPath(x1, y1, x2, y2, lineWidth);
      ctx.strokeStyle = wood;
      ctx.fillStyle = wood;
      ctx.fill();

      const ux = (x2 - x1) / (y2 - y1 || 1);
      for (const band of stick.bands) {
        if (band.width <= 0) continue;
        const centerY = (y1 + y2) * 0.5 + band.offset * 0.5;
        const half = band.width * 0.5;
        ctx.strokeStyle = band.color;
        ctx.lineWidth = lineWidth - 0.5;
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(stickX + (centerY - (y1 + y2) * 0.5) * ux - tilt * 0.5, centerY - half);
        ctx.lineTo(stickX + (centerY - (y1 + y2) * 0.5) * ux - tilt * 0.5, centerY + half);
        ctx.stroke();
      }
    }

    const shine = ctx.createLinearGradient(x, y, x + width, y + height);
    shine.addColorStop(0, "rgba(255, 255, 255, 0.23)");
    shine.addColorStop(0.34, "rgba(255, 255, 255, 0)");
    shine.addColorStop(0.72, "rgba(102, 59, 20, 0.08)");
    shine.addColorStop(1, "rgba(255, 255, 255, 0.08)");
    ctx.fillStyle = shine;
    ctx.fillRect(x, y, width, height);
  }

  function drawLid(box) {
    const rim = clamp(box.width * 0.055, 6, 11);
    const cavityX = box.x + rim;
    const cavityY = box.y + rim;
    const cavityW = box.width - rim * 2;
    const cavityH = box.height - rim;
    const lidX = cavityX + 1;
    const lidW = cavityW - 2;
    const lidH = cavityH - 1;
    const slideDistance = lidH + (state.height - cavityY - cavityH) + 8;
    const lidY = cavityY + 1 + state.lid * slideDistance;
    if (lidY > state.height + 30) return;

    ctx.save();

    // The lid runs inside the tray wall, so its side and front edges remain visible.
    ctx.fillStyle = "rgba(67, 39, 15, 0.2)";
    ctx.fillRect(lidX + 4, lidY + 5, lidW, lidH);
    ctx.fillStyle = "#956137";
    ctx.fillRect(lidX + lidW - 4, lidY + 3, 4, lidH);
    ctx.fillStyle = "#ad7948";
    ctx.fillRect(lidX + 2, lidY + lidH - 4, lidW, 4);

    const lidGradient = ctx.createLinearGradient(lidX, lidY, lidX + lidW, lidY + lidH);
    lidGradient.addColorStop(0, "#f2d7a7");
    lidGradient.addColorStop(0.48, "#e1bd83");
    lidGradient.addColorStop(1, "#c79154");
    ctx.fillStyle = lidGradient;
    ctx.fillRect(lidX, lidY, lidW, lidH);
    ctx.strokeStyle = "rgba(86, 53, 23, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(lidX + 0.5, lidY + 0.5, lidW - 1, lidH - 1);
    drawWoodGrain(lidX, lidY, lidW, lidH);

    ctx.save();
    roundedRect(ctx, lidX + 7, lidY + 7, lidW - 14, lidH - 14, 0);
    ctx.clip();

    // Printed Mikado motif on the lid.
    const centerX = lidX + lidW * 0.5;
    const centerY = lidY + lidH * 0.48;
    const lineColors = ["#d75545", "#3691b0", "#e3b936", "#242623"];
    for (let index = 0; index < 10; index += 1) {
      const spread = (index - 4.5) / 4.5;
      const endX = centerX + spread * lidW * 0.4;
      const endY = lidY + lidH * (0.24 + Math.abs(spread) * 0.08);
      ctx.strokeStyle = "#2c2d29";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.quadraticCurveTo(centerX + spread * lidW * 0.15, lidY + lidH * 0.37, endX, endY);
      ctx.stroke();

      const accentX = lerp(centerX, endX, 0.72);
      const accentY = lerp(centerY, endY, 0.72);
      ctx.strokeStyle = lineColors[index % lineColors.length];
      ctx.lineWidth = 3.2;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(accentX - 1, accentY - 3);
      ctx.lineTo(accentX + 1, accentY + 6);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(37, 35, 30, 0.84)";
    ctx.textAlign = "center";
    ctx.font = `700 ${clamp(lidW * 0.082, 14, 22)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.letterSpacing = "2px";
    ctx.fillText("MIKADO", centerX, lidY + lidH * 0.78);
    ctx.font = `700 ${clamp(lidW * 0.062, 12, 17)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText("SPIEL", centerX, lidY + lidH * 0.82);

    ctx.fillStyle = "rgba(37, 35, 30, 0.48)";
    ctx.font = `700 ${clamp(lidW * 0.035, 6, 9)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText("35 PICK-UP STICKS", centerX, lidY + lidH * 0.9);

    // The thumb groove belongs to the lower, exposed edge of the sliding panel.
    const notchWidth = clamp(lidW * 0.32, 38, 68);
    roundedRect(ctx, centerX - notchWidth * 0.5, lidY + lidH - 9, notchWidth, 6, 2);
    ctx.fillStyle = "rgba(93, 58, 25, 0.38)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 239, 202, 0.28)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = "rgba(99, 63, 27, 0.22)";
    ctx.fillRect(lidX, lidY + lidH - 10, lidW, 1);
    ctx.restore();
    ctx.restore();
  }

  function drawBoxFrame(box) {
    const rim = clamp(box.width * 0.055, 6, 11);
    const gradient = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height);
    gradient.addColorStop(0, "#e3bd83");
    gradient.addColorStop(0.5, "#d5a76c");
    gradient.addColorStop(1, "#b9824b");
    ctx.save();
    const topRail = ctx.createLinearGradient(box.x, box.y, box.x, box.y + rim);
    topRail.addColorStop(0, "#e5c087");
    topRail.addColorStop(1, "#c09058");
    ctx.fillStyle = topRail;
    ctx.fillRect(box.x, box.y, box.width, rim);
    ctx.fillStyle = gradient;
    ctx.fillRect(box.x, box.y + rim, rim, box.height - rim);
    ctx.fillRect(box.x + box.width - rim, box.y + rim, rim, box.height - rim);
    ctx.strokeStyle = "rgba(85, 51, 19, 0.42)";
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);

    // Dark inner lip and a narrow highlight make the lid read as recessed.
    ctx.strokeStyle = "rgba(83, 48, 18, 0.36)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      box.x + rim + 1,
      box.y + rim + 1,
      box.width - rim * 2 - 2,
      box.height - rim - 3
    );
    ctx.strokeStyle = "rgba(255, 241, 209, 0.46)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x + rim + 2, box.y + rim + 2);
    ctx.lineTo(box.x + box.width - rim - 2, box.y + rim + 2);
    ctx.stroke();

    // The lower end is an open channel: the lid leaves the tray through this side.
    ctx.strokeStyle = "rgba(76, 45, 17, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(box.x + rim, box.y + box.height - 1);
    ctx.lineTo(box.x + rim, box.y + box.height - rim * 0.45);
    ctx.moveTo(box.x + box.width - rim, box.y + box.height - 1);
    ctx.lineTo(box.x + box.width - rim, box.y + box.height - rim * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  function drawBoxScene(now) {
    drawPaper();
    const box = getBoxLayout();
    state.boxRect = box;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.filter = "blur(18px)";
    ctx.fillStyle = "rgba(82, 58, 31, 0.12)";
    ctx.beginPath();
    ctx.ellipse(box.x + box.width * 0.55, box.y + box.height + 26, box.width * 0.44, 18, -0.03, 0, TAU);
    ctx.fill();
    ctx.restore();

    drawBoxBase(box, now);
    drawLid(box);
    drawBoxFrame(box);
  }

  function drawPaper() {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawTable(now) {
    drawPaper();
    const setup = cameraSetup();

    if (state.mode === "scattering" || state.mode === "playing" || state.mode === "finished") {
      drawTableSticks(now, setup);
    } else if (state.mode === "hand") {
      drawHeldBundle(now, setup);
    }

    drawHand(now, state.mode === "hand" || state.mode === "scattering");
    drawEffects(setup);

    if (state.mode === "hand" && state.handEnterAt) {
      const veil = 1 - easeOutCubic((now - state.handEnterAt) / 480);
      if (veil > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${veil})`;
        ctx.fillRect(0, 0, state.width, state.height);
      }
    }
  }

  function drawHeldBundle(now, setup) {
    const enter = easeOutCubic((now - state.handEnterAt) / 720);
    const origin = project(0, 0, 0, setup);
    const baseX = state.width * 0.49;
    const baseY = state.height * 0.62 + (1 - enter) * state.height * 0.2;
    const height = clamp(Math.min(state.width, state.height) * 0.37, 190, 360);
    const width = clamp(state.width * 0.18, 64, 128);
    const representative = state.sticks.filter((_, index) => index % 2 === 0).slice(0, 16);

    ctx.save();
    ctx.globalAlpha = enter;
    ctx.translate(baseX, baseY - height * 0.48);
    ctx.rotate(-0.04);
    representative.forEach((stick, index) => {
      const ratio = representative.length === 1 ? 0 : index / (representative.length - 1);
      const topX = (ratio - 0.5) * width * 1.16;
      const bottomX = (ratio - 0.5) * width * 0.6;
      const yTop = -height * 0.48 - Math.sin(ratio * Math.PI) * 17;
      const yBottom = height * 0.48;
      taperedStickPath(topX + 3, yTop + 4, bottomX + 3, yBottom + 4, 5.2);
      ctx.fillStyle = "rgba(74, 49, 22, 0.12)";
      ctx.fill();

      const wood = ctx.createLinearGradient(topX, yTop, bottomX, yBottom);
      wood.addColorStop(0, "#f3ddb0");
      wood.addColorStop(0.55, "#dfb879");
      wood.addColorStop(1, "#b9844d");
      taperedStickPath(topX, yTop, bottomX, yBottom, 4.2);
      ctx.fillStyle = wood;
      ctx.fill();

      const bandY = height * 0.05;
      const bandX = topX + (bottomX - topX) * ((bandY - yTop) / (yBottom - yTop));
      ctx.strokeStyle = stick.kind.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bandX, bandY - 4);
      ctx.lineTo(bandX, bandY + 4);
      ctx.stroke();
    });

    ctx.restore();

    // A faint contact shadow under the bundle.
    ctx.save();
    ctx.globalAlpha = enter * 0.28;
    ctx.filter = "blur(9px)";
    ctx.fillStyle = "#69675f";
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + 34, width * 0.34, 10, -0.08, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawTableSticks(now, setup) {
    let scatterProgress = 1;
    if (state.mode === "scattering") {
      scatterProgress = easeInOutCubic((now - state.scatterStart) / 1080);
    }

    for (const stick of state.sticks) {
      if (!stick.visible || stick.removed) continue;
      let drawX = stick.x;
      let drawY = stick.y;
      let drawAngle = stick.angle;
      let height = stick.stackHeight || 0;

      if (scatterProgress < 1) {
        const eased = scatterProgress;
        drawX = lerp(stick.startX, stick.x, eased);
        drawY = lerp(stick.startY, stick.y, eased);
        drawAngle = stick.finalAngle + stick.spin * (1 - eased);
        height = lerp(0, stick.stackHeight || 0, eased) + Math.sin(eased * Math.PI) * stick.flight;
      }

      drawStick(stick, drawX, drawY, drawAngle, height, setup);
    }
  }

  function drawStick(stick, x, y, angle, z, setup) {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const dx = ux * stick.length * 0.5;
    const dy = uy * stick.length * 0.5;
    const topHeight = z + (stick.thickness || stick.radius * 1.6);
    const p1 = project(x - dx, y - dy, topHeight, setup);
    const p2 = project(x + dx, y + dy, topHeight, setup);
    const shadow1 = project(x - dx, y - dy, 0, setup);
    const shadow2 = project(x + dx, y + dy, 0, setup);
    const center = project(x, y, topHeight, setup);
    const lineWidth = clamp(((p1.scale + p2.scale) * 0.5) * stick.radius * 2, 2.2, 10.5);
    const wobble = stick.wobble > 0
      ? Math.sin(performance.now() * 0.04 + stick.wobblePhase) * stick.wobble * 5
      : 0;
    const shadowOffset = clamp(center.scale * 4.5, 2, 9) + clamp(z * 0.25, 0, 8);
    const shiftX = wobble;
    const top1 = { x: p1.x + shiftX, y: p1.y };
    const top2 = { x: p2.x + shiftX, y: p2.y };

    ctx.save();
    ctx.globalAlpha = state.mode === "scattering" ? 0.45 + Math.min(0.55, z / 290) : 1;

    if (stick.selected) {
      ctx.save();
      taperedStickPath(top1.x, top1.y, top2.x, top2.y, lineWidth + 8);
      ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
      ctx.shadowColor = "rgba(39, 68, 50, 0.24)";
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.restore();
    }

    // Contact shadow on the desk.
    taperedStickPath(
      shadow1.x + shadowOffset,
      shadow1.y + shadowOffset,
      shadow2.x + shadowOffset,
      shadow2.y + shadowOffset,
      lineWidth + 2.2
    );
    ctx.fillStyle = "rgba(52, 57, 54, 0.045)";
    ctx.shadowColor = "rgba(45, 49, 47, 0.05)";
    ctx.shadowBlur = 3;
    ctx.fill();
    ctx.shadowBlur = 0;

    const wood = ctx.createLinearGradient(top1.x, top1.y, top2.x, top2.y);
    wood.addColorStop(0, "#f6e4b9");
    wood.addColorStop(0.18, "#e8c58f");
    wood.addColorStop(0.62, "#f0d4a0");
    wood.addColorStop(1, "#bf8c52");
    taperedStickPath(top1.x, top1.y, top2.x, top2.y, lineWidth);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.strokeStyle = "rgba(103, 67, 29, 0.14)";
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Narrow specular edge on the upper face.
    const nx = -(top2.y - top1.y);
    const ny = top2.x - top1.x;
    const normalLength = Math.hypot(nx, ny) || 1;
    const highlightOffset = lineWidth * 0.18;
    taperedStickPath(
      top1.x + nx / normalLength * highlightOffset,
      top1.y + ny / normalLength * highlightOffset,
      top2.x + nx / normalLength * highlightOffset,
      top2.y + ny / normalLength * highlightOffset,
      Math.max(0.8, lineWidth * 0.16)
    );
    ctx.fillStyle = "rgba(255, 249, 222, 0.5)";
    ctx.fill();

    for (const band of stick.bands) {
      if (band.width <= 0) continue;
      const centerX = x + ux * band.offset;
      const centerY = y + uy * band.offset + wobble * uy;
      const half = band.width * 0.5;
      const b1 = project(centerX - ux * half, centerY - uy * half, topHeight, setup);
      const b2 = project(centerX + ux * half, centerY + uy * half, topHeight, setup);
      ctx.strokeStyle = band.color;
      ctx.lineWidth = lineWidth - 0.75;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(b1.x + shiftX, b1.y);
      ctx.lineTo(b2.x + shiftX, b2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHand(now, raised) {
    if (state.mode !== "hand") return;

    const enterTarget = state.handEnterAt || now;
    const enter = easeOutCubic((now - enterTarget) / 760);
    const settle = 0;

    const scale = clamp(Math.min(state.width, state.height) / 820, 0.65, 1.32);
    const handX = state.width * (raised ? 0.63 : 0.76) + state.camera.yaw * 20;
    const handY = state.height * 0.8 + (1 - enter) * state.height * 0.35 + settle * state.height * 0.08;
    const skin = "#dfbda6";
    const skinLight = "#edd3bf";
    const skinShadow = "#c69d86";

    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(-0.13 + state.camera.yaw * 0.08);
    ctx.scale(scale, scale);

    // Soft shadow gives the hand a place on the white desk.
    ctx.save();
    ctx.globalAlpha = 0.13 * enter;
    ctx.filter = "blur(13px)";
    ctx.fillStyle = "#5c554d";
    ctx.beginPath();
    ctx.ellipse(-4, 104, 142, 62, 0.18, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = enter;

    // Forearm entering from the lower-right corner.
    const armGradient = ctx.createLinearGradient(70, 35, 240, 250);
    armGradient.addColorStop(0, skinLight);
    armGradient.addColorStop(0.52, skin);
    armGradient.addColorStop(1, skinShadow);
    ctx.fillStyle = armGradient;
    ctx.beginPath();
    ctx.moveTo(15, 30);
    ctx.bezierCurveTo(105, 25, 215, 92, 330, 205);
    ctx.lineTo(305, 330);
    ctx.bezierCurveTo(205, 245, 104, 170, 5, 133);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(117, 77, 58, 0.13)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Palm.
    const palmGradient = ctx.createRadialGradient(-36, -16, 8, 10, 42, 155);
    palmGradient.addColorStop(0, skinLight);
    palmGradient.addColorStop(0.62, skin);
    palmGradient.addColorStop(1, skinShadow);
    ctx.fillStyle = palmGradient;
    ctx.beginPath();
    ctx.moveTo(-112, 38);
    ctx.bezierCurveTo(-139, -12, -103, -65, -55, -72);
    ctx.bezierCurveTo(-14, -78, 41, -45, 84, 0);
    ctx.bezierCurveTo(113, 32, 104, 82, 66, 112);
    ctx.bezierCurveTo(20, 148, -55, 126, -99, 84);
    ctx.bezierCurveTo(-121, 64, -126, 54, -112, 38);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(117, 77, 58, 0.2)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Thumb.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-82, 45);
    ctx.bezierCurveTo(-137, 32, -172, 3, -164, -29);
    ctx.bezierCurveTo(-155, -63, -113, -62, -82, -33);
    ctx.bezierCurveTo(-109, -22, -111, 6, -68, 20);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(111, 71, 52, 0.27)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fingers curl toward the bundle so the pose reads as a hand holding sticks.
    const fingerTargets = raised
      ? [
          { startX: -16, startY: -54, endX: -118, endY: -119, bend: -24, width: 22 },
          { startX: 8, startY: -58, endX: -91, endY: -141, bend: -18, width: 23 },
          { startX: 32, startY: -52, endX: -61, endY: -149, bend: -13, width: 22 },
          { startX: 57, startY: -39, endX: -29, endY: -137, bend: -8, width: 19 },
        ]
      : [
          { startX: -20, startY: -55, endX: -94, endY: -94, bend: -15, width: 22 },
          { startX: 5, startY: -60, endX: -68, endY: -107, bend: -10, width: 23 },
          { startX: 31, startY: -53, endX: -40, endY: -104, bend: -5, width: 22 },
          { startX: 56, startY: -38, endX: -13, endY: -91, bend: 0, width: 19 },
        ];

    for (const finger of fingerTargets) {
      ctx.strokeStyle = "rgba(116, 74, 56, 0.18)";
      ctx.lineWidth = finger.width + 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(finger.startX, finger.startY);
      ctx.quadraticCurveTo(
        (finger.startX + finger.endX) * 0.5 + finger.bend,
        (finger.startY + finger.endY) * 0.5,
        finger.endX,
        finger.endY
      );
      ctx.stroke();

      ctx.strokeStyle = skin;
      ctx.lineWidth = finger.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(finger.startX, finger.startY);
      ctx.quadraticCurveTo(
        (finger.startX + finger.endX) * 0.5 + finger.bend,
        (finger.startY + finger.endY) * 0.5,
        finger.endX,
        finger.endY
      );
      ctx.stroke();
    }

    // Small highlights on the knuckles.
    ctx.strokeStyle = "rgba(255, 235, 218, 0.36)";
    ctx.lineWidth = 1.1;
    for (const finger of fingerTargets) {
      ctx.beginPath();
      ctx.moveTo(finger.startX - finger.width * 0.18, finger.startY - 2);
      ctx.quadraticCurveTo(
        (finger.startX + finger.endX) * 0.5 + finger.bend - 2,
        (finger.startY + finger.endY) * 0.5 - 5,
        finger.endX - 1,
        finger.endY - 1
      );
      ctx.stroke();
    }

    // Wrist fold.
    ctx.strokeStyle = "rgba(137, 89, 65, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(27, 76);
    ctx.bezierCurveTo(72, 78, 110, 99, 145, 126);
    ctx.stroke();

    ctx.restore();
  }

  function drawEffects(setup) {
    if (state.blockedEffect) {
      const point = project(state.blockedEffect.x, state.blockedEffect.y, 0, setup);
      const alpha = clamp(state.blockedEffect.life / state.blockedEffect.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "rgba(176, 71, 54, 0.85)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 17 + (1 - alpha) * 16, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    for (const floater of state.floaters) {
      const point = project(floater.x, floater.y, 18, setup);
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#3e4a3f";
      ctx.font = "500 11px 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(floater.text, point.x, point.y - (1 - alpha) * 22);
      ctx.restore();
    }
  }

  function boxContains(point) {
    if (!state.boxRect) return false;
    const box = state.boxRect;
    const pad = 16;
    return point.x >= box.x - pad
      && point.x <= box.x + box.width + pad
      && point.y >= box.y - pad
      && point.y <= box.y + box.height + pad;
  }

  function boxStickAt(point) {
    const box = state.boxRect;
    if (!box) return null;
    const inset = clamp(box.width * 0.085, 12, 21);
    const innerX = box.x + inset + clamp(box.width * 0.035, 7, 12);
    const innerY = box.y + inset + clamp(box.width * 0.04, 8, 13);
    const innerW = box.width - (innerX - box.x) * 2;
    const innerH = box.height - (innerY - box.y) * 2;
    let nearest = null;
    let bestDistance = Infinity;
    for (const stick of state.boxSticks) {
      const stickX = innerX + stick.x * innerW;
      const tilt = stick.tilt * innerH;
      const x1 = stickX + tilt * 0.5;
      const x2 = stickX - tilt * 0.5;
      const y1 = innerY + stick.start * innerH;
      const y2 = innerY + stick.end * innerH;
      const distance = pointSegmentDistance(point.x, point.y, x1, y1, x2, y2);
      if (distance < 12 && distance < bestDistance) {
        nearest = stick;
        bestDistance = distance;
      }
    }
    return nearest;
  }

  function stickAtScreen(point, setup = cameraSetup()) {
    const candidates = [];
    for (const stick of state.sticks) {
      if (!stick.visible || stick.removed) continue;
      const ux = Math.cos(stick.angle);
      const uy = Math.sin(stick.angle);
      const topHeight = (stick.stackHeight || 0) + (stick.thickness || stick.radius * 1.6);
      const p1 = project(stick.x - ux * stick.length * 0.5, stick.y - uy * stick.length * 0.5, topHeight, setup);
      const p2 = project(stick.x + ux * stick.length * 0.5, stick.y + uy * stick.length * 0.5, topHeight, setup);
      const radius = clamp(((p1.scale + p2.scale) * 0.5) * stick.radius * 2, 2.2, 10.5);
      const distance = pointSegmentDistance(point.x, point.y, p1.x, p1.y, p2.x, p2.y);
      if (distance <= radius * 0.5 + 9) {
        candidates.push({ stick, distance });
      }
    }
    candidates.sort((a, b) => {
      if (Math.abs(a.stick.z - b.stick.z) > 0.01) return b.stick.z - a.stick.z;
      return a.distance - b.distance;
    });
    return candidates[0]?.stick || null;
  }

  function bundleContains(point) {
    return point.x > state.width * 0.37
      && point.x < state.width * 0.6
      && point.y > state.height * 0.18
      && point.y < state.height * 0.67;
  }

  function pointSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(px - x1, py - y1);
    const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }

  function segmentsDistance(a, b) {
    const ax = Math.cos(a.angle) * a.length * 0.5;
    const ay = Math.sin(a.angle) * a.length * 0.5;
    const bx = Math.cos(b.angle) * b.length * 0.5;
    const by = Math.sin(b.angle) * b.length * 0.5;

    if (segmentsIntersect(
      a.x - ax, a.y - ay, a.x + ax, a.y + ay,
      b.x - bx, b.y - by, b.x + bx, b.y + by
    )) {
      return 0;
    }

    return Math.min(
      pointSegmentDistance(a.x - ax, a.y - ay, b.x - bx, b.y - by, b.x + bx, b.y + by),
      pointSegmentDistance(a.x + ax, a.y + ay, b.x - bx, b.y - by, b.x + bx, b.y + by),
      pointSegmentDistance(b.x - bx, b.y - by, a.x - ax, a.y - ay, a.x + ax, a.y + ay),
      pointSegmentDistance(b.x + bx, b.y + by, a.x - ax, a.y - ay, a.x + ax, a.y + ay)
    );
  }

  function segmentsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    const d1 = cross(bx2 - bx1, by2 - by1, ax1 - bx1, ay1 - by1);
    const d2 = cross(bx2 - bx1, by2 - by1, ax2 - bx1, ay2 - by1);
    const d3 = cross(ax2 - ax1, ay2 - ay1, bx1 - ax1, by1 - ay1);
    const d4 = cross(ax2 - ax1, ay2 - ay1, bx2 - ax1, by2 - ay1);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  function findBlocker(selected) {
    for (const other of state.sticks) {
      if (other === selected || !other.visible || other.removed) continue;
      if (other.z <= selected.z) continue;
      const gap = segmentsDistance(selected, other);
      if (gap <= selected.radius + other.radius + CONTACT_PADDING) return other;
    }
    return null;
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function capture(event) {
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events do not always support capture.
      }
    }
  }

  function touchDistance(points = [...state.touchPointers.values()]) {
    if (points.length < 2) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  function beginPinch() {
    const distance = touchDistance();
    if (distance < 8) return;
    if (state.selected) resetSelected();
    state.cameraDrag = null;
    state.bundlePress = null;
    state.pinch = {
      startDistance: distance,
      startZoom: state.zoomTarget,
    };
    hoverTag.classList.remove("is-visible");
    canvas.classList.add("is-dragging");
  }

  function onPointerDown(event) {
    if (state.inputLock > 0 || state.paused) return;
    const point = pointerPosition(event);
    event.preventDefault();
    startMusic();

    if (event.pointerType === "touch") {
      state.touchPointers.set(event.pointerId, point);
      if (
        state.touchPointers.size >= 2
        && (state.mode === "hand" || state.mode === "playing")
      ) {
        capture(event);
        beginPinch();
        return;
      }
    }

    if (state.mode === "closed") {
      if (!boxContains(point)) return;
      capture(event);
      scene.classList.add("is-opening");
      startWoodSlideSound();
      state.lidDrag = {
        startY: point.y,
        startLid: state.lid,
        boxHeight: state.boxRect.height,
      };
      state.slideLastY = point.y;
      state.slideTravel = 0;
      canvas.classList.add("is-dragging");
      return;
    }

    if (state.mode === "open") {
      const stick = boxStickAt(point);
      if (!stick) return;
      capture(event);
      state.openPress = { start: point, stick };
      return;
    }

    if (state.mode === "hand") {
      capture(event);
      state.cameraDrag = {
        start: point,
        startYaw: state.camera.yaw,
        startPitch: state.camera.pitch,
        moved: 0,
      };
      state.bundlePress = bundleContains(point);
      canvas.classList.add("is-dragging");
      return;
    }

    if (state.mode === "playing") {
      const stick = stickAtScreen(point);
      if (stick) {
        capture(event);
        state.selected = stick;
        state.dragStart = point;
        state.dragPull = 0;
        stick.originX = stick.x;
        stick.originY = stick.y;
        stick.selected = true;
        state.hovered = null;
        hoverTag.classList.remove("is-visible");
        canvas.classList.add("is-dragging");
        return;
      }

      capture(event);
      state.cameraDrag = {
        start: point,
        startYaw: state.camera.yaw,
        startPitch: state.camera.pitch,
        moved: 0,
      };
      canvas.classList.add("is-dragging");
    }
  }

  function onPointerMove(event) {
    const point = pointerPosition(event);

    if (event.pointerType === "touch" && state.touchPointers.has(event.pointerId)) {
      state.touchPointers.set(event.pointerId, point);
      if (state.pinch && state.touchPointers.size >= 2) {
        const ratio = touchDistance() / Math.max(8, state.pinch.startDistance);
        state.zoomTarget = clamp(state.pinch.startZoom * ratio, 0.72, 2.3);
        state.zoom = lerp(state.zoom, state.zoomTarget, 0.6);
        return;
      }
    }

    if (state.lidDrag) {
      const delta = (point.y - state.lidDrag.startY) / (state.lidDrag.boxHeight * 0.48);
      state.lid = clamp(state.lidDrag.startLid + delta, 0, 1);
      state.lidTarget = state.lid;
      const speed = Math.abs(point.y - state.slideLastY);
      state.slideLastY = point.y;
      setWoodSlideLevel(clamp(speed / 16, 0.08, 1));
      state.slideTravel += Math.abs(delta - (state.lidDrag.lastLid ?? state.lidDrag.startLid));
      state.lidDrag.lastLid = delta;
      if (state.slideTravel > 0.055) {
        playWoodTick(clamp(speed / 24, 0.2, 1));
        state.slideTravel = 0;
      }
      return;
    }

    if (state.openPress) {
      const distance = Math.hypot(point.x - state.openPress.start.x, point.y - state.openPress.start.y);
      state.openPress.moved = Math.max(state.openPress.moved || 0, distance);
      return;
    }

    if (state.cameraDrag) {
      const dx = point.x - state.cameraDrag.start.x;
      const dy = point.y - state.cameraDrag.start.y;
      state.cameraDrag.moved = Math.max(state.cameraDrag.moved, Math.hypot(dx, dy));
      state.camera.yaw = clamp(state.cameraDrag.startYaw + (dx / state.width) * 2.55, -0.82, 0.82);
      state.camera.pitch = clamp(state.cameraDrag.startPitch - (dy / state.height) * 1.38, 0.43, 0.96);
      hoverTag.classList.remove("is-visible");
      return;
    }

    if (state.selected) {
      dragSelected(point);
      return;
    }

    if (state.mode === "playing") {
      const stick = stickAtScreen(point);
      if (state.hovered && state.hovered !== stick) state.hovered.selected = false;
      state.hovered = stick;
      if (stick) {
        stick.selected = true;
        hoverTag.textContent = `${stick.kind.name} · ${stick.kind.value} PTS`;
        hoverTag.style.left = `${point.x}px`;
        hoverTag.style.top = `${point.y}px`;
        hoverTag.classList.add("is-visible");
        canvas.classList.add("is-grabbable");
      } else {
        hoverTag.classList.remove("is-visible");
        canvas.classList.remove("is-grabbable");
      }
    } else if (state.mode === "hand") {
      canvas.classList.toggle("is-grabbable", bundleContains(point));
    } else if (state.mode === "closed") {
      canvas.classList.toggle("is-grabbable", boxContains(point));
    } else if (state.mode === "open") {
      canvas.classList.toggle("is-grabbable", Boolean(boxStickAt(point)));
    }
  }

  function onPointerUp(event) {
    if (event.pointerType === "touch" && state.touchPointers.has(event.pointerId)) {
      state.touchPointers.delete(event.pointerId);
      if (state.pinch) {
        if (state.touchPointers.size >= 2) {
          state.pinch.startDistance = touchDistance();
          state.pinch.startZoom = state.zoomTarget;
        } else {
          state.pinch = null;
          const remaining = [...state.touchPointers.values()][0];
          if (remaining && (state.mode === "hand" || state.mode === "playing")) {
            state.cameraDrag = {
              start: remaining,
              startYaw: state.camera.yaw,
              startPitch: state.camera.pitch,
              moved: 0,
            };
          } else {
            canvas.classList.remove("is-dragging");
          }
        }
        return;
      }
    }

    if (state.lidDrag) {
      state.lidDrag = null;
      state.lidTarget = state.lid > 0.22 ? 1 : 0;
      if (state.lidTarget === 1) {
        setWoodSlideLevel(0.46);
      } else {
        scene.classList.remove("is-opening");
        stopWoodSlideSound(true);
      }
      canvas.classList.remove("is-dragging");
      return;
    }

    if (state.openPress) {
      const wasClick = (state.openPress.moved || 0) < 10;
      state.openPress = null;
      if (wasClick) enterHandScene();
      return;
    }

    if (state.cameraDrag) {
      const shouldScatter = state.mode === "hand"
        && state.bundlePress
        && state.cameraDrag.moved < 9;
      state.cameraDrag = null;
      state.bundlePress = null;
      canvas.classList.remove("is-dragging");
      if (shouldScatter) startScatter();
      return;
    }

    if (state.selected) {
      const stick = state.selected;
      if (Math.abs(state.dragPull) >= extractionDistance(stick)) {
        completeStick(stick);
      } else {
        resetSelected();
        if (Math.abs(state.dragPull) > 18) showToast("PULL FURTHER", false, 900);
      }
    }
  }

  function dragSelected(point) {
    const stick = state.selected;
    if (!stick) return;
    const setup = cameraSetup();
    const center = project(stick.x, stick.y, 0, setup);
    const sample = project(
      stick.x + Math.cos(stick.angle) * 20,
      stick.y + Math.sin(stick.angle) * 20,
      0,
      setup
    );
    const screenDirX = sample.x - center.x;
    const screenDirY = sample.y - center.y;
    const screenDirLength = Math.hypot(screenDirX, screenDirY);
    if (screenDirLength < 1) return;
    const projected20 = screenDirLength / 20;
    const deltaX = point.x - state.dragStart.x;
    const deltaY = point.y - state.dragStart.y;
    const pull = (deltaX * screenDirX + deltaY * screenDirY) / screenDirLength / projected20;
    state.dragPull = pull;

    stick.x = stick.originX + Math.cos(stick.angle) * pull;
    stick.y = stick.originY + Math.sin(stick.angle) * pull;

    if (Math.abs(pull) < 4) return;
    const blocker = findBlocker(stick);
    if (blocker) {
      triggerMiss(stick, blocker);
      return;
    }
    if (Math.abs(pull) >= extractionDistance(stick)) {
      completeStick(stick);
    }
  }

  function extractionDistance(stick) {
    return Math.max(118, stick.length * 0.62);
  }

  function resetSelected() {
    const stick = state.selected;
    if (stick) {
      stick.x = stick.originX;
      stick.y = stick.originY;
      stick.selected = false;
    }
    state.selected = null;
    state.dragStart = null;
    state.dragPull = 0;
    canvas.classList.remove("is-dragging");
  }

  function triggerMiss(stick, blocker) {
    state.misses += 1;
    state.lives = Math.max(0, state.lives - 1);
    state.combo = 0;
    state.blockedEffect = {
      x: blocker.x,
      y: blocker.y,
      life: 0.65,
      maxLife: 0.65,
    };
    blocker.wobble = 1;
    blocker.wobblePhase = Math.random() * TAU;
    state.inputLock = 0.32;
    resetSelected();
    showToast("BLOCKED · LIFE LOST", true, 1100);
    updateHud();
    playTone("miss");
    if (state.lives <= 0) window.setTimeout(() => finishGame("OUT OF LIVES"), 430);
  }

  function completeStick(stick) {
    stick.removed = true;
    stick.visible = false;
    stick.selected = false;
    state.selected = null;
    state.dragStart = null;
    state.dragPull = 0;
    state.picked += 1;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    const bonus = Math.min(5, Math.max(0, state.combo - 1));
    const awarded = stick.kind.value + bonus;
    state.score += awarded;
    state.best = Math.max(state.best, state.score);
    saveBest();
    state.floaters.push({
      x: stick.x,
      y: stick.y,
      text: `+${awarded}`,
      life: 1,
      maxLife: 1,
    });
    canvas.classList.remove("is-dragging");
    hoverTag.classList.remove("is-visible");
    showToast(`${stick.kind.name} +${awarded}`, false, 900);
    updateHud();
    playTone("success", state.combo);

    if (state.picked >= TOTAL_STICKS) {
      const clearBonus = Math.ceil(state.timeLeft) * 2;
      state.score += clearBonus;
      state.best = Math.max(state.best, state.score);
      saveBest();
      finishGame("ALL CLEARED", clearBonus);
    }
  }

  function enterHandScene() {
    if (state.mode !== "open") return;
    state.mode = "hand";
    state.handEnterAt = performance.now();
    state.camera.yaw = -0.06;
    state.camera.pitch = 0.72;
    state.openPress = null;
    canvas.className = "";
    updateChrome();
    playTone("lift");
  }

  function startScatter() {
    if (state.mode !== "hand") return;
    state.mode = "scattering";
    state.scatterStart = performance.now();
    state.score = 0;
    state.timeLeft = START_TIME;
    state.lives = MAX_LIVES;
    state.picked = 0;
    state.misses = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.startBest = state.best;
    state.secondStamp = -1;
    buildTableSticks();
    updateHud();
    updateTimer(true);
    updateChrome();
    playStickScatterSound();
    playTone("scatter");
  }

  function beginGame() {
    if (state.mode !== "tutorial") return;
    state.mode = "playing";
    state.lastTime = performance.now();
    tutorialOverlay.classList.remove("is-visible");
    updateChrome();
    showToast("DRAG SPACE TO LOOK · DRAG A STICK TO PULL", false, 1900);
    playTone("start");
    startMusic();
  }

  function finishGame(reason, clearBonus = 0) {
    if (state.mode === "finished") return;
    state.mode = "finished";
    resetSelected();
    state.cameraDrag = null;
    state.lidDrag = null;
    state.inputLock = 0;
    tutorialOverlay.classList.remove("is-visible");
    const newBest = state.score > state.startBest && state.score > 0;
    state.best = Math.max(state.best, state.score);
    saveBest();
    resultReason.textContent = reason;
    resultScore.textContent = state.score;
    const stickLabel = state.picked === 1 ? "STICK" : "STICKS";
    const missLabel = state.misses === 1 ? "MISS" : "MISSES";
    resultMeta.textContent = `${state.picked} ${stickLabel} · BEST STREAK ${state.maxCombo} · ${state.misses} ${missLabel}`;
    resultBest.textContent = newBest
      ? `PERSONAL BEST · ${state.best}${clearBonus ? ` · CLEAR BONUS +${clearBonus}` : ""}`
      : `PERSONAL BEST · ${state.best}`;
    hoverTag.classList.remove("is-visible");
    result.classList.add("is-visible");
    updateChrome();
    playTone("finish");
  }

  function resetGame() {
    stopWoodSlideSound(false);
    tutorialOverlay.classList.remove("is-visible");
    result.classList.remove("is-visible");
    state.mode = "closed";
    scene.classList.remove("is-opening");
    state.lid = 0;
    state.lidTarget = 0;
    state.lidDrag = null;
    state.openPress = null;
    state.cameraDrag = null;
    state.bundlePress = null;
    state.touchPointers.clear();
    state.pinch = null;
    state.selected = null;
    state.dragStart = null;
    state.dragPull = 0;
    state.camera = { yaw: -0.06, pitch: 0.72 };
    state.zoom = 1;
    state.zoomTarget = 1;
    state.score = 0;
    state.lives = MAX_LIVES;
    state.timeLeft = START_TIME;
    state.picked = 0;
    state.misses = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.startBest = state.best;
    state.floaters = [];
    state.blockedEffect = null;
    state.inputLock = 0;
    state.round += 1;
    buildBoxSticks();
    buildTableSticks();
    canvas.className = "";
    updateHud();
    updateTimer(true);
    updateChrome();
  }

  function updateHud() {
    scoreValue.textContent = state.score;
    document.querySelectorAll("[data-life]").forEach((life) => {
      life.classList.toggle("is-lost", Number(life.dataset.life) > state.lives);
    });
  }

  function updateTimer(force = false) {
    const seconds = Math.max(0, Math.ceil(state.timeLeft));
    if (!force && seconds === state.secondStamp) return;
    state.secondStamp = seconds;
    timeValue.textContent = seconds;
    const ratio = clamp(state.timeLeft / START_TIME, 0, 1);
    timeRuleFill.style.transform = `scaleX(${ratio})`;
    timeRule.classList.toggle("is-low", state.timeLeft <= 15);
  }

  function updateChrome() {
    scene.dataset.mode = state.mode;
    const copy = {
      closed: ["SLIDE TO OPEN", "PRESS THE LID AND PULL DOWN"],
      open: ["PICK A STICK", "MOVE INTO THE DESK VIEW"],
      hand: ["LET THEM FALL", "TAP THE BUNDLE TO SCATTER"],
      scattering: ["", ""],
      tutorial: ["", ""],
      playing: ["", ""],
      finished: ["", ""],
    }[state.mode];
    if (copy) {
      guideTitle.textContent = copy[0];
      guideText.textContent = copy[1];
    }
  }

  function showToast(message, isError = false, duration = 1000) {
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.classList.add("is-visible");
    state.toastTimer = duration / 1000;
  }

  function update(delta, now) {
    if (state.inputLock > 0) state.inputLock = Math.max(0, state.inputLock - delta);
    state.zoom += (state.zoomTarget - state.zoom) * Math.min(1, delta * 11);

    if (state.mode === "closed" && state.lidDrag === null) {
      state.lid += (state.lidTarget - state.lid) * Math.min(1, delta * 14);
      if (Math.abs(state.lid - state.lidTarget) < 0.002) state.lid = state.lidTarget;
      if (state.lidTarget === 1 && state.lid > 0.994) {
        state.lid = 1;
        state.mode = "open";
        scene.classList.remove("is-opening");
        updateChrome();
        stopWoodSlideSound(true);
      }
    }

    if (state.mode === "scattering" && now - state.scatterStart >= 1080) {
      state.mode = "tutorial";
      state.lastTime = now;
      state.startBest = state.best;
      updateChrome();
      tutorialOverlay.classList.add("is-visible");
      playTone("tutorial");
    }

    if (state.mode === "playing" && !state.paused) {
      state.timeLeft = Math.max(0, state.timeLeft - delta);
      updateTimer();
      if (state.timeLeft <= 0) finishGame("TIME'S UP");
    }

    for (const stick of state.sticks) {
      if (stick.wobble > 0) stick.wobble = Math.max(0, stick.wobble - delta * 2);
    }
    if (state.blockedEffect) {
      state.blockedEffect.life -= delta;
      if (state.blockedEffect.life <= 0) state.blockedEffect = null;
    }
    for (const floater of state.floaters) {
      floater.life -= delta;
      floater.y -= delta * 18;
    }
    state.floaters = state.floaters.filter((floater) => floater.life > 0);

    if (state.toastTimer > 0) {
      state.toastTimer -= delta;
      if (state.toastTimer <= 0) toast.classList.remove("is-visible");
    }
  }

  function render(now) {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);
    if (state.mode === "closed" || state.mode === "open") {
      drawBoxScene(now);
    } else {
      drawTable(now);
    }
  }

  function frame(now) {
    const delta = Math.min(0.05, (now - state.lastTime) / 1000 || 0);
    state.lastTime = now;
    update(delta, now);
    render(now);
    requestAnimationFrame(frame);
  }

  function getAudio() {
    if (!state.soundOn) return null;
    if (!state.audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      state.audio = new AudioContext();
    }
    if (state.audio.state === "suspended") state.audio.resume().catch(() => {});
    return state.audio;
  }

  function startWoodSlideSound() {
    if (!state.soundOn || state.slideAudio) return;
    const audio = getAudio();
    if (!audio) return;

    const length = Math.floor(audio.sampleRate * 1.8);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      smoothed = smoothed * 0.82 + white * 0.18;
      data[index] = smoothed;
    }

    const source = audio.createBufferSource();
    const friction = audio.createBiquadFilter();
    const frictionGain = audio.createGain();
    const body = audio.createBiquadFilter();
    const bodyGain = audio.createGain();
    source.buffer = buffer;
    source.loop = true;
    friction.type = "bandpass";
    friction.frequency.value = 760;
    friction.Q.value = 1.1;
    frictionGain.gain.value = 0.0001;
    body.type = "lowpass";
    body.frequency.value = 240;
    body.Q.value = 3.2;
    bodyGain.gain.value = 0.0001;
    source.connect(friction);
    friction.connect(frictionGain);
    frictionGain.connect(audio.destination);
    source.connect(body);
    body.connect(bodyGain);
    bodyGain.connect(audio.destination);
    source.start();
    state.slideAudio = {
      source,
      friction,
      frictionGain,
      body,
      bodyGain,
    };
  }

  function setWoodSlideLevel(level) {
    if (!state.slideAudio || !state.audio || !state.soundOn) return;
    const audio = state.audio;
    const time = audio.currentTime;
    const frictionGain = 0.004 + clamp(level, 0, 1) * 0.052;
    const bodyGain = 0.002 + clamp(level, 0, 1) * 0.026;
    state.slideAudio.frictionGain.gain.cancelScheduledValues(time);
    state.slideAudio.frictionGain.gain.setTargetAtTime(frictionGain, time, 0.035);
    state.slideAudio.bodyGain.gain.cancelScheduledValues(time);
    state.slideAudio.bodyGain.gain.setTargetAtTime(bodyGain, time, 0.045);
    state.slideAudio.friction.frequency.setTargetAtTime(570 + level * 620, time, 0.06);
    state.slideAudio.body.frequency.setTargetAtTime(190 + level * 150, time, 0.07);
  }

  function stopWoodSlideSound(withKnock = true) {
    if (!state.slideAudio || !state.audio) return;
    const slide = state.slideAudio;
    const time = state.audio.currentTime;
    slide.frictionGain.gain.cancelScheduledValues(time);
    slide.frictionGain.gain.setTargetAtTime(0.0001, time, 0.035);
    slide.bodyGain.gain.cancelScheduledValues(time);
    slide.bodyGain.gain.setTargetAtTime(0.0001, time, 0.035);
    try {
      slide.source.stop(time + 0.18);
    } catch {
      // The source may already have ended.
    }
    state.slideAudio = null;
    if (withKnock && state.soundOn) playWoodKnock();
  }

  function playWoodKnock() {
    const audio = getAudio();
    if (!audio) return;
    const time = audio.currentTime;
    const length = Math.floor(audio.sampleRate * 0.11);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const decay = Math.pow(1 - index / length, 3.2);
      data[index] = (Math.random() * 2 - 1) * decay * 0.38;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 430;
    gain.gain.setValueAtTime(0.055, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start(time);
  }

  function playWoodTick(intensity = 0.5) {
    if (!state.soundOn) return;
    const audio = getAudio();
    if (!audio) return;
    const time = audio.currentTime;
    const length = Math.floor(audio.sampleRate * 0.045);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const decay = Math.pow(1 - index / length, 2.4);
      data[index] = (Math.random() * 2 - 1) * decay;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 780 + Math.random() * 420;
    filter.Q.value = 1.6;
    gain.gain.setValueAtTime(0.006 + intensity * 0.009, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start(time);
  }

  function playStickScatterSound() {
    if (!state.soundOn) return;
    const audio = getAudio();
    if (!audio) return;
    const start = audio.currentTime;
    const length = Math.floor(audio.sampleRate * 0.075);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const decay = Math.pow(1 - index / length, 3);
      data[index] = (Math.random() * 2 - 1) * decay;
    }

    // A cascade of small wooden impacts as the bundle breaks apart.
    for (let index = 0; index < 26; index += 1) {
      const click = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      const delay = 0.32 + Math.random() * 0.76;
      const strength = 0.005 + Math.random() * 0.014;
      click.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = 780 + Math.random() * 1650;
      filter.Q.value = 0.7 + Math.random() * 1.4;
      gain.gain.setValueAtTime(strength, start + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.075);
      click.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      click.start(start + delay);
    }

    const thump = audio.createOscillator();
    const thumpGain = audio.createGain();
    thump.type = "triangle";
    thump.frequency.setValueAtTime(135, start + 0.83);
    thump.frequency.exponentialRampToValueAtTime(58, start + 1.08);
    thumpGain.gain.setValueAtTime(0.0001, start + 0.82);
    thumpGain.gain.exponentialRampToValueAtTime(0.026, start + 0.88);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.12);
    thump.connect(thumpGain);
    thumpGain.connect(audio.destination);
    thump.start(start + 0.82);
    thump.stop(start + 1.13);
  }

  function trackMusicNode(music, node) {
    music.nodes.push(node);
    node.addEventListener("ended", () => {
      const index = music.nodes.indexOf(node);
      if (index >= 0) music.nodes.splice(index, 1);
    }, { once: true });
  }

  function schedulePad(audio, music, frequencies, startTime) {
    frequencies.forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const pan = audio.createStereoPanner ? audio.createStereoPanner() : null;
      const attack = 1.6 + index * 0.08;
      const releaseAt = startTime + 5.9 + index * 0.1;
      oscillator.type = index % 2 === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (index - 2) * 2.4;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.011, startTime + attack);
      gain.gain.setValueAtTime(0.011, releaseAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 8);
      oscillator.connect(gain);
      if (pan) {
        pan.pan.value = (index - 2) * 0.08;
        gain.connect(pan);
        pan.connect(music.master);
      } else {
        gain.connect(music.master);
      }
      oscillator.start(startTime);
      oscillator.stop(startTime + 8.05);
      trackMusicNode(music, oscillator);
    });
  }

  function scheduleBell(audio, music, frequency, startTime) {
    const oscillator = audio.createOscillator();
    const overtone = audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    oscillator.type = "sine";
    overtone.type = "sine";
    oscillator.frequency.value = frequency;
    overtone.frequency.value = frequency * 2.01;
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.009, startTime + 0.055);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.3);
    oscillator.connect(filter);
    overtone.connect(filter);
    filter.connect(gain);
    gain.connect(music.master);
    oscillator.start(startTime);
    overtone.start(startTime);
    oscillator.stop(startTime + 2.35);
    overtone.stop(startTime + 2.35);
    trackMusicNode(music, oscillator);
    trackMusicNode(music, overtone);
  }

  function schedulePluck(audio, music, frequency, startTime) {
    const oscillator = audio.createOscillator();
    const overtone = audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    oscillator.type = "sine";
    overtone.type = "triangle";
    oscillator.frequency.value = frequency;
    overtone.frequency.value = frequency * 2;
    filter.type = "lowpass";
    filter.frequency.value = 1850;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0048, startTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.72);
    oscillator.connect(filter);
    overtone.connect(filter);
    filter.connect(gain);
    gain.connect(music.master);
    oscillator.start(startTime);
    overtone.start(startTime);
    oscillator.stop(startTime + 0.76);
    overtone.stop(startTime + 0.76);
    trackMusicNode(music, oscillator);
    trackMusicNode(music, overtone);
  }

  function scheduleMusic() {
    if (!state.music || !state.audio || state.paused) return;
    const audio = state.audio;
    const music = state.music;
    const horizon = audio.currentTime + 1.2;
    const chords = [
      [174.61, 220.0, 261.63, 329.63, 392.0],
      [146.83, 174.61, 220.0, 261.63, 329.63],
      [116.54, 146.83, 174.61, 220.0, 293.66],
      [130.81, 164.81, 196.0, 246.94, 293.66],
    ];
    const bells = [698.46, 783.99, 880.0, 1046.5, 1174.66];
    const arpeggio = [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 698.46, 587.33];

    while (music.nextChord < horizon) {
      schedulePad(audio, music, chords[music.chordIndex % chords.length], music.nextChord);
      music.chordIndex += 1;
      music.nextChord += 7.36;
    }
    while (music.nextBell < horizon) {
      const bellIndex = (music.bellStep * 3 + music.chordIndex) % bells.length;
      scheduleBell(audio, music, bells[bellIndex], music.nextBell);
      music.bellStep += 1;
      music.nextBell += 3.68;
    }
    while (music.nextArp < horizon) {
      const note = arpeggio[music.arpStep % arpeggio.length];
      schedulePluck(audio, music, note, music.nextArp);
      music.arpStep += 1;
      music.nextArp += 0.92;
    }
  }

  function startMusic() {
    if (!state.soundOn || state.music) return;
    const audio = getAudio();
    if (!audio) return;
    const master = audio.createGain();
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1900;
    filter.Q.value = 0.45;
    master.gain.setValueAtTime(0.0001, audio.currentTime);
    master.gain.exponentialRampToValueAtTime(0.62, audio.currentTime + 1.8);
    master.connect(filter);
    filter.connect(audio.destination);
    state.music = {
      master,
      filter,
      nodes: [],
      timer: null,
      nextChord: audio.currentTime + 0.08,
      nextBell: audio.currentTime + 2.2,
      nextArp: audio.currentTime + 0.46,
      chordIndex: 0,
      bellStep: 0,
      arpStep: 0,
    };
    scheduleMusic();
    state.music.timer = window.setInterval(scheduleMusic, 600);
  }

  function stopMusic(fadeSeconds = 0.8) {
    if (!state.music || !state.audio) return;
    const music = state.music;
    const audio = state.audio;
    const time = audio.currentTime;
    state.music = null;
    if (music.timer) window.clearInterval(music.timer);
    music.master.gain.cancelScheduledValues(time);
    music.master.gain.setValueAtTime(Math.max(0.0001, music.master.gain.value), time);
    music.master.gain.exponentialRampToValueAtTime(0.0001, time + fadeSeconds);
    window.setTimeout(() => {
      try {
        music.nodes.forEach((node) => {
          try {
            node.stop();
          } catch {
            // Nodes may already have reached their stop time.
          }
        });
        music.master.disconnect();
        music.filter.disconnect();
      } catch {
        // The graph is already disconnected.
      }
    }, fadeSeconds * 1000 + 80);
  }

  function playTone(type, combo = 0) {
    if (!state.soundOn) return;
    const audio = getAudio();
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    oscillator.connect(gain);
    gain.connect(audio.destination);

    let frequency = 320;
    let duration = 0.08;
    let volume = 0.025;
    let wave = "sine";
    if (type === "success") {
      frequency = 470 + Math.min(combo, 6) * 42;
      duration = 0.11;
      volume = 0.023;
    } else if (type === "miss") {
      frequency = 105;
      duration = 0.16;
      volume = 0.042;
      wave = "triangle";
    } else if (type === "open" || type === "lift") {
      frequency = 180;
      duration = 0.22;
      volume = 0.025;
      wave = "triangle";
    } else if (type === "scatter") {
      frequency = 260;
      duration = 0.32;
      volume = 0.034;
      wave = "triangle";
    } else if (type === "start") {
      frequency = 360;
      duration = 0.16;
      volume = 0.025;
    } else if (type === "finish") {
      frequency = 230;
      duration = 0.28;
      volume = 0.03;
      wave = "triangle";
    }

    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (type === "success") {
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.22, now + duration);
    } else if (type === "miss") {
      oscillator.frequency.exponentialRampToValueAtTime(58, now + duration);
    } else if (type === "scatter" || type === "lift") {
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 2.1, now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    saveSoundPreference();
    soundButton.classList.toggle("is-muted", !state.soundOn);
    soundButton.setAttribute("aria-pressed", String(state.soundOn));
    soundButton.setAttribute("aria-label", state.soundOn ? "Mute sound" : "Unmute sound");
    if (!state.soundOn) {
      stopWoodSlideSound(false);
      stopMusic(0.25);
    } else {
      playTone("success");
      startMusic();
    }
  }

  function onWheel(event) {
    if (state.mode !== "hand" && state.mode !== "playing") return;
    event.preventDefault();
    const direction = Math.exp(-event.deltaY * 0.002);
    state.zoomTarget = clamp(state.zoomTarget * direction, 0.72, 2.05);
    hoverTag.classList.remove("is-visible");
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", () => {
    if (!state.selected && !state.cameraDrag && !state.lidDrag) {
      if (state.hovered) state.hovered.selected = false;
      state.hovered = null;
      hoverTag.classList.remove("is-visible");
    }
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", onWheel, { passive: false });

  soundButton.addEventListener("click", toggleSound);
  document.getElementById("beginButton").addEventListener("click", beginGame);
  document.getElementById("restartButton").addEventListener("click", resetGame);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    state.paused = document.hidden && state.mode === "playing";
    if (state.music && state.audio) {
      const time = state.audio.currentTime;
      const level = document.hidden ? 0.0001 : 0.62;
      state.music.master.gain.cancelScheduledValues(time);
      state.music.master.gain.setTargetAtTime(level, time, 0.22);
      if (!document.hidden) {
        state.music.nextChord = Math.max(state.music.nextChord, time + 0.12);
        state.music.nextBell = Math.max(state.music.nextBell, time + 0.7);
        state.music.nextArp = Math.max(state.music.nextArp, time + 0.12);
      }
    }
    state.lastTime = performance.now();
  });

  soundButton.classList.toggle("is-muted", !state.soundOn);
  soundButton.setAttribute("aria-pressed", String(state.soundOn));
  soundButton.setAttribute("aria-label", state.soundOn ? "Mute sound" : "Unmute sound");
  resize();
  buildBoxSticks();
  buildTableSticks();
  updateHud();
  updateTimer(true);
  updateChrome();
  requestAnimationFrame((now) => {
    state.lastTime = now;
    requestAnimationFrame(frame);
  });

  if (new URLSearchParams(location.search).has("debug")) {
    window.__mikadoDebug = {
      state,
      project,
      cameraSetup,
      stickAtScreen,
      findBlocker,
      getBoxLayout,
      boxStickAt,
      bundleContains,
      buildTableSticks,
      enterHandScene,
      startScatter,
      beginGame,
      finishGame,
      resetGame,
      updateChrome,
    };
  }
})();
