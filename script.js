const root = document.documentElement;
const dyeCanvas = document.getElementById('dye-canvas');
const dyeCtx = dyeCanvas ? dyeCanvas.getContext('2d') : null;
const vesselContainer = document.getElementById('vessel-3d');
const editToggle = document.getElementById('toggle-edit');
const resetContentButton = document.getElementById('reset-content');
const formMessage = document.getElementById('form-message');

const STORAGE_KEY = 'hakki-dye-state-v2';
const CONTENT_KEY = 'hakki-site-content-v1';
const dyeState = {
  intensity: 0,
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.45,
  hue: 210,
};

const pointer = { x: dyeState.x, y: dyeState.y };
const motion = { px: 0, py: 0, scroll: 0 };
const scrollState = { currentY: 0, targetY: 0 };
let journalOverrideHue = null;
let isEditMode = false;

function getTimeBasedAccent() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return { color: '#5b8def', hue: 215 };
  if (hour >= 11 && hour < 17) return { color: '#35c8d2', hue: 186 };
  if (hour >= 17 && hour < 21) return { color: '#f09a57', hue: 25 };
  return { color: '#4458b8', hue: 230 };
}

function easeTo(current, target, speed = 0.08) {
  return current + (target - current) * speed;
}

function resizeDyeCanvas() {
  if (!dyeCanvas) return;
  dyeCanvas.width = window.innerWidth;
  dyeCanvas.height = window.innerHeight;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    Object.assign(dyeState, JSON.parse(raw));
  } catch {
    // ignore
  }
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[key];
  }, obj);
}

function setByPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, key) => {
    if (acc[key] === undefined) {
      acc[key] = Number.isNaN(Number(key)) ? {} : [];
    }
    return acc[key];
  }, obj);
  target[last] = value;
}

function collectContentModel() {
  const model = {};
  document.querySelectorAll('[data-edit-key]').forEach((node) => {
    const key = node.dataset.editKey;
    setByPath(model, key, node.textContent.trim());
  });
  return model;
}

function loadContent() {
  const fallback = collectContentModel();
  try {
    const raw = localStorage.getItem(CONTENT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function applyContent(model) {
  document.querySelectorAll('[data-edit-key]').forEach((node) => {
    const key = node.dataset.editKey;
    const value = getByPath(model, key);
    if (typeof value === 'string') node.textContent = value;
  });
}

function persistContent(model) {
  localStorage.setItem(CONTENT_KEY, JSON.stringify(model));
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dyeState));
}

function drawDye() {
  if (!dyeCtx || !dyeCanvas) return;
  dyeCtx.clearRect(0, 0, dyeCanvas.width, dyeCanvas.height);
  const radius = Math.max(dyeCanvas.width, dyeCanvas.height) * (0.28 + dyeState.intensity * 0.62);
  const grad = dyeCtx.createRadialGradient(dyeState.x, dyeState.y, 0, dyeState.x, dyeState.y, radius);

  grad.addColorStop(0, `hsla(${dyeState.hue}, 72%, 60%, ${0.09 + dyeState.intensity * 0.14})`);
  grad.addColorStop(0.55, `hsla(${dyeState.hue}, 64%, 70%, ${0.05 + dyeState.intensity * 0.1})`);
  grad.addColorStop(1, `hsla(${dyeState.hue}, 70%, 80%, 0)`);

  dyeCtx.fillStyle = grad;
  dyeCtx.fillRect(0, 0, dyeCanvas.width, dyeCanvas.height);
}

function colorToHue(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

function setAmbientColor(hue) {
  root.style.setProperty('--page-tint', `hsla(${hue}, 52%, 74%, 0.18)`);
}

function getScrollHue(progress) {
  const stops = [210, 186, 25, 230];
  const segments = stops.length - 1;
  const clamped = Math.min(0.9999, Math.max(0, progress));
  const seg = Math.floor(clamped * segments);
  const local = (clamped * segments) - seg;
  const start = stops[seg];
  const end = stops[Math.min(seg + 1, stops.length - 1)];
  return start + (end - start) * local;
}

function setupReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

function setupJournalColorChange() {
  document.querySelectorAll('.journal-item').forEach((item) => {
    item.addEventListener('mouseenter', () => {
      const color = item.dataset.color;
      if (!color) return;
      root.style.setProperty('--accent', color);
      const hue = colorToHue(color);
      if (hue !== null) {
        journalOverrideHue = hue;
        dyeState.hue = hue;
        setAmbientColor(hue);
      }
      persistState();
    });
    item.addEventListener('mouseleave', () => {
      journalOverrideHue = null;
    });
  });
}

function setupJournalRail() {
  const rail = document.querySelector('.journal-list');
  if (!rail) return;

  rail.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    rail.scrollBy({ left: event.deltaY * 0.9, behavior: 'smooth' });
  }, { passive: false });

  document.querySelectorAll('[data-journal-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const direction = button.dataset.journalNav === 'next' ? 1 : -1;
      const amount = rail.clientWidth * 0.82;
      rail.scrollBy({ left: amount * direction, behavior: 'smooth' });
    });
  });
}

function setupParallax() {
  window.addEventListener('scroll', () => {
    scrollState.targetY = window.scrollY;
  }, { passive: true });
}

function applySmoothScrollEffects() {
  const max = document.body.scrollHeight - window.innerHeight || 1;
  scrollState.currentY = easeTo(scrollState.currentY, scrollState.targetY, 0.11);
  motion.scroll = scrollState.currentY / max;
  dyeState.intensity = Math.min(1, Math.max(dyeState.intensity, motion.scroll * 0.9));

  const scrollHue = getScrollHue(motion.scroll);
  const activeHue = journalOverrideHue ?? scrollHue;
  dyeState.hue = easeTo(dyeState.hue, activeHue, 0.08);
  setAmbientColor(dyeState.hue);
  root.style.setProperty('--accent', `hsl(${Math.round(dyeState.hue)} 64% 58%)`);

  document.querySelectorAll('.parallax').forEach((el) => {
    const depth = Number(el.dataset.depth || 0.08);
    el.style.transform = `translate3d(0, ${-(scrollState.currentY * depth)}px, 0)`;
  });
}

function setupPointer() {
  window.addEventListener('mousemove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    motion.px = (event.clientX / window.innerWidth) * 2 - 1;
    motion.py = (event.clientY / window.innerHeight) * 2 - 1;
    dyeState.intensity = Math.min(1, dyeState.intensity + 0.018);
  });
}

function setupSmoothAnchorLinks() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;

      event.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 66;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

function setupWobbleText() {
  document.querySelectorAll('.wobble-text').forEach((node) => {
    const chars = Array.from(node.textContent || '');
    node.textContent = '';
    chars.forEach((char, index) => {
      const span = document.createElement('span');
      span.className = 'wobble-char';
      span.style.setProperty('--i', String(index));
      span.textContent = char;
      node.appendChild(span);
    });
  });
}

function setupEditableContent() {
  const contentModel = loadContent();
  applyContent(contentModel);

  function toggleEditMode(force) {
    isEditMode = typeof force === 'boolean' ? force : !isEditMode;
    editToggle?.setAttribute('aria-pressed', String(isEditMode));
    document.querySelectorAll('[data-edit-key]').forEach((node) => {
      node.setAttribute('contenteditable', String(isEditMode));
      node.setAttribute('spellcheck', 'false');
    });
  }

  editToggle?.addEventListener('click', () => toggleEditMode());

  document.querySelectorAll('[data-edit-key]').forEach((node) => {
    node.addEventListener('blur', () => {
      if (!isEditMode) return;
      const key = node.dataset.editKey;
      setByPath(contentModel, key, node.textContent.trim());
      persistContent(contentModel);
    });
  });

  resetContentButton?.addEventListener('click', () => {
    localStorage.removeItem(CONTENT_KEY);
    window.location.reload();
  });

  toggleEditMode(false);
}

function setupContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') || '').trim(),
      email: String(data.get('email') || '').trim(),
      message: String(data.get('message') || '').trim(),
      at: new Date().toISOString(),
    };

    localStorage.setItem('hakki-contact-draft', JSON.stringify(payload));
    if (formMessage) {
      formMessage.textContent = '送信ありがとうございました。内容を受け付けました。';
    }
    form.reset();
  });
}

function setupVessel3D() {
  if (!window.THREE || !vesselContainer) {
    document.body.classList.add('no-three');
    return null;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 100);
  camera.position.set(0, 0.95, 5.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  vesselContainer.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d9de, 1.1);
  scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
  keyLight.position.set(2.4, 2.8, 3.2);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xb9d3ff, 0.5);
  rimLight.position.set(-2.6, 1.3, -2.2);
  scene.add(rimLight);

  const profile = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const y = -1.28 + t * 2.56;
    const radius = 0.45 + Math.sin(t * Math.PI) * 1.42 + Math.pow(t, 1.6) * 0.25;
    profile.push(new THREE.Vector2(radius * 0.38, y * 0.55));
  }

  const geometry = new THREE.LatheGeometry(profile, 120);
  const position = geometry.attributes.position;
  const base = position.array.slice();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf9f9f8,
    metalness: 0,
    roughness: 0.35,
    transmission: 0.08,
    thickness: 0.25,
    clearcoat: 0.55,
    clearcoatRoughness: 0.42,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xffffff),
  });

  const vessel = new THREE.Mesh(geometry, material);
  vessel.position.y = 0.05;
  scene.add(vessel);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.65, 80),
    new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.38 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.1;
  scene.add(floor);

  function resize() {
    const { clientWidth, clientHeight } = vesselContainer;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  return {
    render(time) {
      const t = time * 0.001;
      const idleX = Math.sin(t * 0.55) * 0.07;
      const idleY = Math.cos(t * 0.4) * 0.05;
      const gentleSpin = t * 0.22;
      vessel.rotation.y = gentleSpin + idleY + motion.px * 0.12;
      vessel.rotation.x = -0.16 + idleX + motion.py * -0.08 + motion.scroll * 0.12;
      vessel.rotation.z = Math.sin(t * 0.3) * 0.025 + motion.px * 0.02;
      vessel.position.y = 0.03 + Math.sin(t * 0.5) * 0.06;

      const arr = position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i];
        const y = base[i + 1];
        const z = base[i + 2];

        const theta = Math.atan2(z, x);
        const radial = Math.sqrt(x * x + z * z);
        const smoothBand = Math.exp(-Math.pow((y + 0.06) * 1.35, 2));
        const wave = Math.sin(theta * 2.2 + t * 1.05) * 0.015;
        const breathe = Math.sin(t * 0.95 + y * 2.2) * 0.012;
        const pointerPush = motion.px * Math.cos(theta) * 0.008 + motion.py * Math.sin(theta) * 0.007;
        const scrollPush = Math.sin(theta * 3.5 + motion.scroll * 12) * motion.scroll * 0.026;
        const offset = (wave + breathe + pointerPush + scrollPush) * smoothBand;

        const nextR = radial + offset;
        arr[i] = Math.cos(theta) * nextR;
        arr[i + 2] = Math.sin(theta) * nextR;
      }

      position.needsUpdate = true;
      geometry.computeVertexNormals();
      renderer.render(scene, camera);
    },
  };
}

function tick(vessel3D, time) {
  dyeState.x = easeTo(dyeState.x, pointer.x, 0.06);
  dyeState.y = easeTo(dyeState.y, pointer.y, 0.06);
  applySmoothScrollEffects();
  drawDye();
  vessel3D?.render(time);
  requestAnimationFrame((t) => tick(vessel3D, t));
}

(function init() {
  const timeAccent = getTimeBasedAccent();
  loadState();
  root.style.setProperty('--accent', timeAccent.color);
  if (!dyeState.hue) dyeState.hue = timeAccent.hue;

  resizeDyeCanvas();
  scrollState.currentY = window.scrollY;
  scrollState.targetY = window.scrollY;

  setupReveal();
  setupPointer();
  setupParallax();
  setupWobbleText();
  setupJournalColorChange();
  setupJournalRail();
  setupSmoothAnchorLinks();
  setupEditableContent();
  setupContactForm();

  const vessel3D = setupVessel3D();
  tick(vessel3D, 0);

  window.addEventListener('resize', resizeDyeCanvas);
  window.addEventListener('beforeunload', persistState);
})();
