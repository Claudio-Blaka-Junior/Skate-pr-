// =====================================================================
//  Skate 3D estilo Tony Hawk — Three.js 0.160.0 (importmap no index.html)
//  Cenário: PSX Les Coleman Skatepark (CC0)
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ---------- Configurações (ajuste aqui) ----------
const CFG = {
  modelo: 'models/skatista.glb',
  sons: { pulo: ['sounds/salto.mp3', 'sounds/ollie.mp3', 'sounds/pulo.mp3'], aterrissar: 'sounds/aterrissar.mp3', musica: ['sounds/trilha.mp3', 'sounds/musica.mp3'] },
  alturaPersonagem: 1.8, rotacaoModelo: 0,
  vMax: 20, velInicial: 2.5, tempoDobrar: 0.5,  // andando, a velocidade dobra a cada 0,5 s (até vMax)
  freio: 14, giroRumo: 2.4,
  gravidade: 20, impulsoPulo: 8 * Math.sqrt(1.25), tempoAgachar: 0.2, // pulo 25% mais alto
  gravidadeRampa: 15,    // gravidade mais suave depois de sair de uma rampa (mais tempo no ar)
  vyMinRampa: 8, vyMaxRampa: 13, // impulso vertical ao sair da rampa (garante tempo para 3 manobras)
  multAereo: 5,          // manobras em sequência no ar: raio na tela e pontos do combo x5
  giroAr: 7,             // rad/s de giro no ar (A/D)
  tempoCombo: 0.7,       // tempo no chão depois de aterrissar até o combo ser fechado e somado
  tempoMult: 10,         // 10 s sem manobra: o multiplicador volta a 1
  combosPorNivel: 5,     // a cada 5 combos seguidos, fogo e raios do painel sobem de nível
  tolPouso: 0.6,         // quanto MENOR, mais fácil de cair (0.5 era a regra anterior)
  tempoJogo: 60,         // duração da partida (segundos)
  grindIntervalo: 0.1, grindPontos: 10,
  grindMultiplica: false, // true = multiplica por 10 a cada 0,1 s (cresce MUITO rápido)

  // ----- Cenário (skatepark) -----
  parque: {
    arquivo: 'models/skatepark/skatepark.fbx',
    texturas: 'models/skatepark/textures/',
    escala: 0.02,                  // o modelo vem em centímetros: 0.01 = tamanho real, 0.02 = 2x maior (rampas boas para o salto do jogo)
    centro: [1295, 1575],          // centro do parque no modelo (cm), levado para x=0, z=0
    interior: { xMin: -300, xMax: 2890, zMin: -500, zMax: 3650 }, // parte de dentro das muretas/grades (cm)
    celula: 0.1,                   // resolução do mapa de alturas (metros)
  },
  inicio: { x: -26, z: -16, rumo: Math.PI / 2 },   // largada (rumo PI/2 = andando para +x)
  corrimao: { ax: -10, az: -16, bx: 24, bz: -16 }, // único corrimão, na faixa livre do meio do parque
};
const MANOBRAS = {
  KeyJ: { nome: 'Mortal para trás', pts: 250, eixo: 'x', dur: 0.5 },
  KeyK: { nome: 'Kickflip', pts: 150, eixo: 'z', sinal: 1, dur: 0.35 },
  KeyL: { nome: 'Pop Shove-it', pts: 100, eixo: 'y', dur: 0.35 },
};

// ---------- Áudio (arquivo ausente = silêncio) ----------
function criarSom(urls, { loop = false, volume = 1 } = {}) {
  urls = [].concat(urls); let n = 0;      // aceita um arquivo ou uma lista de alternativas
  const a = new Audio(); a.loop = loop; a.volume = volume; let ok = true;
  a.addEventListener('error', () => {
    console.warn(`[som] "${urls[n]}" indisponível.`);
    if (++n < urls.length) { a.src = urls[n]; return; } // tenta o próximo arquivo da lista
    ok = false;
    const av = document.getElementById('aviso'); if (av) av.textContent += `Som não carregou (arquivo ausente ou formato inválido): ${urls.join(' ou ')}. `;
  });
  a.src = urls[0];
  return {
    volume(v) { a.volume = v; },
    tocar() { if (!ok) return; try { a.currentTime = 0; a.play()?.catch(() => {}); } catch (_) {} },
    liberar() { // destrava o som no clique inicial
      if (!ok) return;
      try { a.muted = true; a.play()?.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; }); } catch (_) { a.muted = false; }
    },
  };
}
const somPulo = criarSom(CFG.sons.pulo, { volume: 0.8 });
const somAterrissar = criarSom(CFG.sons.aterrissar, { volume: 0.9 });
const somMusica = criarSom(CFG.sons.musica, { loop: true, volume: 0.4 });
// Controles de volume da tela inicial (música e efeitos separados)
const sliderMus = document.getElementById('volMusica'), sliderEfe = document.getElementById('volEfeitos');
function aplicarVolumes() { somMusica.volume(sliderMus.value / 100); somPulo.volume(sliderEfe.value / 100); somAterrissar.volume(sliderEfe.value / 100); }
sliderMus.addEventListener('input', aplicarVolumes); sliderEfe.addEventListener('input', aplicarVolumes); aplicarVolumes();

// ---------- Cena, luz e câmera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc7ee);
scene.fog = new THREE.Fog(0x8fc7ee, 120, 420);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 700);
scene.add(new THREE.HemisphereLight(0xffffff, 0x55606e, 0.95));
const sol = new THREE.DirectionalLight(0xffffff, 1.4);
sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 70 });
scene.add(sol, sol.target);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

// ---------- Cenário: skatepark ----------
const P = CFG.parque, ESC = P.escala;
// Limites de dentro do parque (em metros, com uma folga de 0,6 m das muretas)
const LIM = {
  x0: (P.interior.xMin - P.centro[0]) * ESC + 0.6, x1: (P.interior.xMax - P.centro[0]) * ESC - 0.6,
  z0: (P.interior.zMin - P.centro[1]) * ESC + 0.6, z1: (P.interior.zMax - P.centro[1]) * ESC - 0.6,
};
// A câmera nunca sai de dentro do alambrado (senão a grade fica na frente da tela)
const CAMLIM = { x0: (P.interior.xMin - P.centro[0]) * ESC + 0.2, x1: (P.interior.xMax - P.centro[0]) * ESC - 0.2, z0: (P.interior.zMin - P.centro[1]) * ESC + 0.2, z1: (P.interior.zMax - P.centro[1]) * ESC - 0.2 };
const limitarX = (v) => THREE.MathUtils.clamp(v, LIM.x0, LIM.x1);
const limitarZ = (v) => THREE.MathUtils.clamp(v, LIM.z0, LIM.z1);

// Piso escuro até o horizonte (evita ver o vazio fora do parque)
const chaoBase = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4b4846 }));
chaoBase.position.y = -0.05; chaoBase.receiveShadow = true; scene.add(chaoBase);

// Mapa de alturas: cada triângulo do cenário é "desenhado" numa grade (x,z) guardando o ponto mais alto.
// É por ele que o jogo sabe onde é chão, rampa, degrau ou parede (alturaEm).
let alt = null;
function montarAlturas(raiz) {
  const cs = P.celula, x0 = LIM.x0 - 1.6, z0 = LIM.z0 - 1.6, x1 = LIM.x1 + 1.6, z1 = LIM.z1 + 1.6;
  const nx = Math.floor((x1 - x0) / cs) + 1, nz = Math.floor((z1 - z0) / cs) + 1;
  const H = new Float32Array(nx * nz);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  raiz.updateMatrixWorld(true);
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(det) < 1e-9) continue;                       // triângulo vertical (parede fina, grade): não tem área vista de cima
      const ia = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - x0) / cs)), ib = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - x0) / cs));
      const ja = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - z0) / cs)), jb = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - z0) / cs));
      for (let j = ja; j <= jb; j++) {
        const z = z0 + j * cs;
        for (let i = ia; i <= ib; i++) {
          const x = x0 + i * cs;
          const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det, l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det, l3 = 1 - l1 - l2;
          if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
          const h = l1 * a.y + l2 * b.y + l3 * c.y;
          if (h > H[j * nx + i]) H[j * nx + i] = h;
        }
      }
    }
  });
  return { H, nx, nz, x0, z0, cs };
}
// Altura do chão em (x,z): rampas e bancos suaves; degraus e muretas viram "degrau" seco (sem interpolar)
function alturaEm(x, z) {
  if (!alt) return 0;
  const { H, nx, nz, x0, z0, cs } = alt;
  const fx = THREE.MathUtils.clamp((x - x0) / cs, 0, nx - 1.001), fz = THREE.MathUtils.clamp((z - z0) / cs, 0, nz - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * nx + i;
  const h00 = H[k], h10 = H[k + 1], h01 = H[k + nx], h11 = H[k + nx + 1];
  if (Math.max(h00, h10, h01, h11) - Math.min(h00, h10, h01, h11) > 0.35) return tz < 0.5 ? (tx < 0.5 ? h00 : h10) : (tx < 0.5 ? h01 : h11);
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}
async function carregarParque() {
  try {
    const loader = new FBXLoader(); loader.setResourcePath(P.texturas);
    const raiz = await loader.loadAsync(P.arquivo);
    raiz.scale.setScalar(ESC); raiz.position.set(-P.centro[0] * ESC, 0, -P.centro[1] * ESC); raiz.updateMatrixWorld(true);
    raiz.traverse((o) => {
      if (!o.isMesh) return;
      const grade = [].concat(o.material).some((m) => /fence/i.test(m.name));
      if (grade) { // alambrado: tela fina e translúcida, sem sombra (a textura é uma malha de arame bem fina)
        const m = o.material;
        o.material = new THREE.MeshBasicMaterial({ map: m.map, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        o.castShadow = o.receiveShadow = false; return;
      }
      o.castShadow = o.receiveShadow = true;
      for (const m of [].concat(o.material)) {
        if (m.specular) m.specular.set(0x000000);                // sem brilho plástico
        if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.anisotropy = 4; } // pixels nítidos, visual PSX
      }
    });
    scene.add(raiz);
    alt = montarAlturas(raiz);
  } catch (e) {
    console.warn(`[cenário] falha ao carregar "${P.arquivo}": usando piso plano.`, e);
    chaoBase.position.y = 0;
    const av = document.getElementById('aviso'); if (av) av.textContent += `Falha ao carregar o cenário (usando piso plano): ${e.message || e}`.slice(0, 200);
  }
}

// ---------- Corrimão (único) ----------
const CORRIMAOS = [];
const matMetal = new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.7, roughness: 0.3 });
function criarCorrimao(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), r = { ax, az, dx: dx / len, dz: dz / len, len, y: 0.9 };
  CORRIMAOS.push(r);
  const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8).rotateX(Math.PI / 2), matMetal);
  barra.position.set((ax + bx) / 2, r.y, (az + bz) / 2); barra.rotation.y = Math.atan2(dx, dz); barra.castShadow = true; scene.add(barra);
  for (let t = 0; t <= len; t += 3) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, r.y, 0.08), matMetal); p.position.set(ax + r.dx * t, r.y / 2, az + r.dz * t); scene.add(p);
  }
}
criarCorrimao(CFG.corrimao.ax, CFG.corrimao.az, CFG.corrimao.bx, CFG.corrimao.bz);

// ---------- Jogador: corpo > (skate + personagem) ----------
const jogador = new THREE.Group(), corpo = new THREE.Group(), visual = new THREE.Group(), skate = new THREE.Group(), salto = new THREE.Group();
function montarSkate() {
  const lado = new THREE.MeshStandardMaterial({ color: 0xff3d7f }), cima = new THREE.MeshStandardMaterial({ color: 0x222831 });
  const tabua = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.9), [lado, lado, cima, lado, lado, lado]);
  tabua.position.y = 0.03; tabua.castShadow = true; skate.add(tabua);
  for (const [x, z] of [[-0.15, -0.3], [0.15, -0.3], [-0.15, 0.3], [0.15, 0.3]]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffd166 }));
    r.position.set(x, -0.04, z); skate.add(r);
  }
}
montarSkate(); skate.position.y = 0.1; visual.position.y = 0.16;
corpo.add(skate, visual); corpo.position.y = -0.9; salto.position.y = 0.9; salto.add(corpo); // 'salto' gira no mortal, em torno do centro do corpo
jogador.add(salto); scene.add(jogador);
const pos = jogador.position;

// Modelo GLB (sem animações = efeito de escala; com animações = AnimationMixer + crossfade)
let mixer = null, atual = null, animacaoProcedural = false; const acoes = {};
const NOMES = { parado: ['parado', 'idle'], agachar: ['agachar', 'crouch'], pulo: ['pulo', 'jump'], aterrissar: ['aterrissar', 'land'] };
function tocarAnim(papel) {
  const a = acoes[papel]; if (!a || a === atual) return;
  a.reset(); a.setLoop(papel === 'parado' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.play();
  atual ? atual.crossFadeTo(a, 0.2, false) : a.fadeIn(0.2); atual = a;
}
const avisoEl = document.getElementById('aviso');
function usarCubo() {
  animacaoProcedural = true;
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshStandardMaterial({ color: 0xff3d7f }));
  c.position.y = 0.8; c.castShadow = true; visual.add(c);
}
(async () => {
  try {
    const loader = new GLTFLoader(), draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
    loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(CFG.modelo), modelo = gltf.scene;
    console.log('Animações no GLB:', gltf.animations.map((c) => c.name));
    modelo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    modelo.rotation.y = CFG.rotacaoModelo; modelo.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(modelo, true);
    modelo.scale.setScalar(CFG.alturaPersonagem / (caixa.getSize(new THREE.Vector3()).y || 1)); modelo.updateMatrixWorld(true);
    const c2 = new THREE.Box3().setFromObject(modelo, true), ct = c2.getCenter(new THREE.Vector3());
    modelo.position.set(-ct.x, -c2.min.y, -ct.z); visual.add(modelo);
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(modelo); const usados = new Set();
      for (const p of ['aterrissar', 'agachar', 'pulo', 'parado']) {
        const c = gltf.animations.find((c) => !usados.has(c) && NOMES[p].some((n) => c.name.toLowerCase().includes(n)));
        if (c) { usados.add(c); acoes[p] = mixer.clipAction(c); }
      }
      tocarAnim('parado');
    } else animacaoProcedural = true;
  } catch (e) {
    console.warn(`[modelo] falha ao carregar "${CFG.modelo}": usando cubo.`, e);
    avisoEl.textContent = `Falha ao carregar o modelo (usando cubo): ${e.message || e}`.slice(0, 200); usarCubo();
  }
})();

// ---------- Entrada e HUD ----------
const tecla = new Set(); let jogando = false, pedPulo = false, pedManobra = null, parqueOk = false;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat) { if (e.code === 'Space') pedPulo = true; if (MANOBRAS[e.code]) pedManobra = e.code; }
  tecla.add(e.code);
});
addEventListener('keyup', (e) => tecla.delete(e.code));
addEventListener('blur', () => tecla.clear());
const k = (...c) => c.some((x) => tecla.has(x));
const telaInicio = document.getElementById('inicio');
const btnComecar = document.getElementById('comecar');
btnComecar.disabled = true; btnComecar.textContent = 'Carregando cenário…'; // libera quando o parque termina de carregar
const comecar = () => { if (jogando || !parqueOk) return; jogando = true; telaInicio.style.display = 'none'; somPulo.liberar(); somAterrissar.liberar(); somMusica.tocar(); };
btnComecar.addEventListener('click', comecar);
addEventListener('keydown', (e) => { if (e.code === 'Enter') comecar(); });

const elTotal = document.getElementById('total'), elCombo = document.getElementById('comboTxt'), elMsg = document.getElementById('msg'), elTempo = document.getElementById('tempo'), elFim = document.getElementById('fim'), elSeq = document.getElementById('seq'), elPainel = document.getElementById('painel'), elTermo = document.getElementById('termo'), elTermoFill = document.getElementById('termoFill');
let msgT = 0;
function msg(t, ms = 1300) { elMsg.textContent = t; clearTimeout(msgT); msgT = setTimeout(() => { elMsg.textContent = ''; }, ms); }

// ---------- Estado do jogo ----------
let estado = 'chao';           // chao | agachando | ar | grind | queda
let tEst = 0, tAterr = 0, rumo = CFG.inicio.rumo, vel = 0, vy = 0, vyChao = 0;
const vh = new THREE.Vector2(); // velocidade horizontal no ar (x, z)
let trick = null, fila = [], manobrasNoAr = 0, gravAtual = CFG.gravidade, voltas = 0, giroAcum = 0, comboT = 0, gT = 0, gCD = 0;
let rail = null, railT = 0, railSinal = 1, railVel = 0, railYaw = 0, railLado = false;
let total = 0, pontosCombo = 0, mult = 1, tempo = CFG.tempoJogo, fim = false;
let tMult = 0, nCombos = 0, ultTotal = '', ultCombo = '', ultSeq = '';
const PAPEL = { chao: 'parado', agachando: 'agachar', ar: 'pulo', grind: 'parado', queda: 'aterrissar' };
function setEstado(e) { estado = e; if (mixer) tocarAnim(PAPEL[e]); }
const difAng = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const girarAte = (a, alvo, f) => a + difAng(a, alvo) * Math.min(1, f);
function distCorrimao(r, x, z) { // distância de um ponto ao corrimão (usada para não atravessá-lo)
  const rx = x - r.ax, rz = z - r.az, t = THREE.MathUtils.clamp(rx * r.dx + rz * r.dz, 0, r.len);
  return Math.hypot(rx - r.dx * t, rz - r.dz * t);
}

function atividade() { tMult = CFG.tempoMult; }                    // fez manobra: reinicia os 3 s do termômetro
function zerarMult() { mult = 1; nCombos = 0; }
function pulsar(el) { el.classList.remove('pulso'); void el.offsetWidth; el.classList.add('pulso'); }
function explodir() { elPainel.classList.remove('burst'); void elPainel.offsetWidth; elPainel.classList.add('burst'); msg(`${nCombos} COMBOS!`, 1400); }
// ---------- Combo aéreo: sequência de 2 a 4 letras (J no máximo uma vez), uma letra de cada vez ----------
const elTeclas = document.getElementById('teclas');
let seq = null, seqIdx = 0;
function mostrarSeq() { // mostra TODAS as letras da sequência de uma vez; a atual fica em destaque
  if (!seq) { elTeclas.className = ''; return; }
  elTeclas.innerHTML = seq.map((c, i) => `<b class="cap ${i < seqIdx ? 'ok' : i === seqIdx ? 'atual' : ''}">${c.slice(3)}</b>`).join('');
  elTeclas.className = 'visivel';
}
function limparSequencia() { seq = null; mostrarSeq(); }
const COMBOS = [['KeyJ', 'KeyK', 'KeyK', 'KeyK'], ['KeyJ', 'KeyL', 'KeyL', 'KeyL'], ['KeyJ', 'KeyK', 'KeyL', 'KeyK']]; // JKKK, JLLL, JKLK
let ultimoCombo = -1;
function novaSequencia() { // sorteia um dos combos fixos (sem repetir o anterior)
  let n; do { n = Math.floor(Math.random() * COMBOS.length); } while (n === ultimoCombo);
  ultimoCombo = n; seq = COMBOS[n]; seqIdx = 0; mostrarSeq();
}
function fimSequencia(acertou) { // verde se completou (e já surge outro combo), vermelho se errou
  seq = null; elTeclas.className = `visivel ${acertou ? 'completo' : 'erro'}`;
  setTimeout(() => {
    if (seq) return;                                          // já existe uma sequência nova (outro salto)
    if (acertou && estado === 'ar' && !fim) novaSequencia();  // acertou e continua no ar: aparece outro combo
    else elTeclas.className = '';
  }, acertou ? 300 : 450);
}
function entrarNoAr(grav) {
  manobrasNoAr = 0; voltas = 0; giroAcum = 0; gravAtual = grav;
  const altura = Math.max(0, pos.y - alturaEm(pos.x, pos.z)); // estima o tempo no ar: só pede letras se der tempo
  if ((vy + Math.sqrt(vy * vy + 2 * grav * altura)) / grav >= 0.8) novaSequencia(); else limparSequencia();
}

// ---------- Marcos de pontuação: frases chamativas, cada uma com um estilo ----------
const elMarco = document.getElementById('marco');
const MARCOS = [
  { pts: 300000, texto: 'INSANO', cls: 'm1' },
  { pts: 500000, texto: 'COLOSSAL', cls: 'm2' },
  { pts: 1000000, texto: 'MEGA PONTUAÇÃO', cls: 'm3' },
  { pts: 10000000, texto: 'PLAYER LENDÁRIO !!!!!!', cls: 'm4' },
  { pts: 30000000, texto: 'TITÂNICO', cls: 'm5' },
];
let marcoIdx = 0, filaMarcos = [], marcoOcupado = false;
function proximoMarco() {
  const m = filaMarcos.shift();
  if (!m) { marcoOcupado = false; return; }
  marcoOcupado = true; elMarco.className = ''; elMarco.textContent = m.texto; void elMarco.offsetWidth; elMarco.className = `mostra ${m.cls}`;
  setTimeout(proximoMarco, 1500);
}
function checarMarcos() { // chamado quando a pontuação sobe; vários marcos de uma vez entram em fila
  while (marcoIdx < MARCOS.length && total >= MARCOS[marcoIdx].pts) filaMarcos.push(MARCOS[marcoIdx++]);
  if (!marcoOcupado) proximoMarco();
}
// Raio forte na tela (clarão, três raios sorteados e tremor da imagem)
const elRaio = document.getElementById('raioTela'), elRaioSvg = elRaio.querySelector('svg');
function raioForte() {
  let h = '';
  for (let b = 0; b < 3; b++) {
    let x = 15 + Math.random() * 70, pts = '';
    for (let y = 0; y <= 100; y += 10) { pts += `${x.toFixed(1)},${y} `; x += (Math.random() - 0.5) * 18; }
    h += `<polyline points="${pts}"/>`;
  }
  elRaioSvg.innerHTML = h;
  for (const [el, cls] of [[elRaio, 'ativo'], [renderer.domElement, 'tremor']]) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
}
function terminarManobra(prox = false) { // soma os pontos e devolve skate e corpo à posição normal
  if (!trick) return;
  atividade(); pontosCombo += trick.def.pts; manobrasNoAr++;
  if (trick.combo) { // acertou a ordem das letras (a partir do 2º acerto): combo aéreo
    pontosCombo *= CFG.multAereo; raioForte(); msg(`${trick.def.nome}! COMBO NO AR x${CFG.multAereo}`, 1300);
  } else msg(`${trick.def.nome}! +${trick.def.pts}`);
  skate.rotation.set(0, 0, 0); salto.rotation.x = 0; trick = null;
  if (prox && fila.length) { const q = fila.shift(); trick = { def: MANOBRAS[q.code], t: 0, combo: q.combo }; } else fila = []; // manobras na fila começam em seguida
}
function cair(motivo) { // queda: perde combo e multiplicador
  trick = null; fila = []; limparSequencia(); salto.rotation.x = 0; somAterrissar.tocar();
  pontosCombo = 0; zerarMult(); comboT = 0; vel = 0; vh.set(0, 0); vy = 0; rail = null;
  visual.rotation.x = -1.3; visual.position.y = 0.4; skate.rotation.set(0.4, 0.8, 1.2);
  tEst = 1.1; setEstado('queda');
}
function aterrissar(gy) {
  pos.y = gy; vy = 0; vyChao = 0; limparSequencia();
  if (trick && trick.def.eixo === 'x' && trick.t < 0.85) return cair('Mortal incompleto!');
  terminarManobra();
  const sp = vh.length(), yaw = jogador.rotation.y;
  // Aterrissou de lado em relação ao movimento? Então cai.
  if (sp > 2 && Math.abs((Math.sin(yaw) * vh.x + Math.cos(yaw) * vh.y) / sp) < CFG.tolPouso) return cair('Aterrissou de lado!');
  if (sp > 0.5) { rumo = Math.atan2(vh.x, vh.y); vel = sp; }
  somAterrissar.tocar(); tAterr = 0.25; if (mixer) tocarAnim('aterrissar');
  if (pontosCombo > 0) comboT = CFG.tempoCombo;
  estado = 'chao'; voltas = 0;
}
function iniciarGrind(r, t) {
  terminarManobra(); limparSequencia();
  const yaw = jogador.rotation.y, sp = vh.length();
  rail = r; railT = t; railSinal = (vh.x * r.dx + vh.y * r.dz) >= 0 ? 1 : -1; railVel = Math.max(sp, 6);
  rumo = Math.atan2(railSinal * r.dx, railSinal * r.dz);
  // De frente (50-50): corpo alinhado ao corrimão. De lado (boardslide): corpo atravessado, sem cair.
  railLado = Math.abs(Math.sin(yaw) * r.dx + Math.cos(yaw) * r.dz) < CFG.tolPouso;
  railYaw = !railLado ? rumo : (Math.abs(difAng(yaw, rumo + Math.PI / 2)) < Math.abs(difAng(yaw, rumo - Math.PI / 2)) ? rumo + Math.PI / 2 : rumo - Math.PI / 2);
  vy = 0; gT = 0; comboT = 0; atividade(); setEstado('grind'); msg(railLado ? 'BOARDSLIDE!' : '50-50!', 800);
}
function sairGrind(pulo) {
  vh.set(rail.dx * railSinal * railVel, rail.dz * railSinal * railVel); vy = pulo ? CFG.impulsoPulo * 0.8 : 3;
  if (pulo) somPulo.tocar();
  jogador.rotation.y = rumo; // volta a olhar para a frente antes de aterrissar
  rail = null; gCD = 0.4; entrarNoAr(CFG.gravidade); setEstado('ar');
}
function encerrar() { // fim dos 60 s: soma o combo pendente e mostra a pontuação final
  fim = true; total += pontosCombo * mult; pontosCombo = 0; trick = null; fila = []; limparSequencia();
  document.getElementById('final').textContent = Math.floor(total).toLocaleString('pt-BR'); elFim.style.display = 'flex';
}
function reiniciar() {
  total = 0; pontosCombo = 0; mult = 1; nCombos = 0; tMult = 0; comboT = 0; tempo = CFG.tempoJogo; fim = false; trick = null; fila = []; rail = null; limparSequencia(); marcoIdx = 0; filaMarcos = []; marcoOcupado = false; elMarco.className = '';
  vel = 0; vy = 0; vyChao = 0; vh.set(0, 0); rumo = CFG.inicio.rumo; tAterr = 0;
  jogador.rotation.y = rumo; corpo.rotation.x = 0; salto.rotation.x = 0; visual.rotation.x = 0; visual.position.y = 0.16; skate.rotation.set(0, 0, 0);
  pos.set(CFG.inicio.x, alturaEm(CFG.inicio.x, CFG.inicio.z), CFG.inicio.z); // largada no parque
  setEstado('chao'); elFim.style.display = 'none';
}
elFim.addEventListener('click', reiniciar);

function atualizar(dt) {
  const on = jogando && !fim;
  if (on && (tempo -= dt) <= 0) { tempo = 0; encerrar(); }
  const W = on && k('KeyW', 'ArrowUp'), S = on && k('KeyS', 'ArrowDown');
  const dirX = on ? (k('KeyA', 'ArrowLeft') ? 1 : k('KeyD', 'ArrowRight') ? -1 : 0) : 0; // esquerda = +1
  const pulo = on && pedPulo, manobra = on ? pedManobra : null; pedPulo = false; pedManobra = null;
  gCD -= dt; tMult = Math.max(0, tMult - dt);
  if (tMult === 0 && mult > 1) zerarMult();       // 10 s sem manobra: multiplicador volta a 1

  if (estado === 'chao' || estado === 'agachando') {
    rumo += dirX * CFG.giroRumo * Math.min(1, Math.abs(vel) / 3 + 0.3) / (1 + Math.max(0, vel) / 25) * dt;
    const fx = Math.sin(rumo), fz = Math.cos(rumo);
    if (W) { vel = vel < CFG.vMax ? Math.min(CFG.vMax, Math.max(vel, CFG.velInicial) * Math.pow(2, dt / CFG.tempoDobrar)) : vel * Math.exp(-0.5 * dt); } // dobra a cada 0,5 s
    else { vel *= Math.exp(-0.8 * dt); if (Math.abs(vel) < 0.3) vel = 0; }                                                       // parou: zera
    if (S) vel = Math.max(-3, vel - CFG.freio * dt);
    vel = THREE.MathUtils.clamp(vel, -3, 28);
    const rx = pos.x + fx * vel * dt, rz = pos.z + fz * vel * dt, nx = limitarX(rx), nz = limitarZ(rz), g = alturaEm(nx, nz);
    const bateu = nx !== rx || nz !== rz || CORRIMAOS.some((r) => pos.y < r.y - 0.2 && distCorrimao(r, nx, nz) < 0.4);
    if (g - pos.y > 0.5 || bateu) vel = 0;                            // bateu (rampa, corrimão ou borda): velocidade zera
    else if (pos.y - g > 0.5) {                                       // saiu do topo da rampa: decola
      pos.x = nx; pos.z = nz; vy = Math.min(CFG.vyMaxRampa, Math.max(vel > 3 ? CFG.vyMinRampa : 0, vyChao * 1.25)); vh.set(fx * vel, fz * vel); entrarNoAr(CFG.gravidadeRampa); setEstado('ar');
    } else { vyChao = (g - pos.y) / dt; pos.set(nx, g, nz); }
    if (pulo && estado === 'chao') { tEst = CFG.tempoAgachar; setEstado('agachando'); }
    if (estado === 'agachando' && (tEst -= dt) <= 0) {                // impulso do pulo
      vy = CFG.impulsoPulo + Math.min(8, Math.max(0, vyChao)); vh.set(fx * vel, fz * vel); entrarNoAr(CFG.gravidade); somPulo.tocar(); setEstado('ar');
    }
    const p = THREE.MathUtils.clamp(Math.atan2(alturaEm(pos.x + fx * 0.6, pos.z + fz * 0.6) - alturaEm(pos.x - fx * 0.6, pos.z - fz * 0.6), 1.2), -0.9, 0.9);
    corpo.rotation.x += (-p - corpo.rotation.x) * Math.min(1, 12 * dt);  // inclina junto com a rampa
    jogador.rotation.y = girarAte(jogador.rotation.y, rumo, 12 * dt);
    if (estado === 'chao' && pontosCombo > 0 && (comboT -= dt) <= 0) {  // fecha o combo: soma e dobra o multiplicador
      const ganho = pontosCombo * mult; total += ganho; msg(`COMBO! +${ganho.toLocaleString('pt-BR')} (x${mult})`, 1800);
      mult = Math.min(mult * 2, 1024); pontosCombo = 0; nCombos++; if (nCombos % CFG.combosPorNivel === 0) explodir(); checarMarcos();
    }
  } else if (estado === 'ar') {
    vy -= gravAtual * dt;
    if (dirX) { // giro aéreo: 50 pontos por meia-volta (180°); cada meia-volta vale mais que a anterior
      const d = dirX * CFG.giroAr * dt; jogador.rotation.y += d; giroAcum += Math.abs(d);
      while (giroAcum >= Math.PI) { giroAcum -= Math.PI; voltas++; pontosCombo += 50 * voltas; atividade(); msg(`Giro ${voltas * 180}°  +${50 * voltas}`, 800); }
    }
    let nx = limitarX(pos.x + vh.x * dt), nz = limitarZ(pos.z + vh.y * dt);
    if (CORRIMAOS.some((r) => pos.y < r.y - 0.2 && distCorrimao(r, nx, nz) < 0.4)) { nx = pos.x; nz = pos.z; vh.set(0, 0); } // não atravessa o corrimão
    pos.x = nx; pos.z = nz; pos.y += vy * dt;
    corpo.rotation.x += (0 - corpo.rotation.x) * Math.min(1, 8 * dt);
    if (manobra && (!trick || fila.length < 2)) { // várias manobras no ar (até 2 na fila)
      let combo = false;
      if (seq) { // letra certa: avança; letra errada: a sequência acaba e o combo aéreo não vale
        if (manobra === seq[seqIdx]) { seqIdx++; combo = seqIdx >= 2; if (seqIdx >= seq.length) fimSequencia(true); else mostrarSeq(); }
        else fimSequencia(false);
      }
      if (!trick) { trick = { def: MANOBRAS[manobra], t: 0, combo }; atividade(); } else fila.push({ code: manobra, combo });
    }
    if (trick) {
      const d = trick.def; trick.t += dt / d.dur; const e = 1 - Math.pow(1 - Math.min(trick.t, 1), 2);
      if (d.eixo === 'x') salto.rotation.x = -2 * Math.PI * e;                       // mortal para trás
      else if (d.eixo === 'z') skate.rotation.z = d.sinal * 2 * Math.PI * e;
      else skate.rotation.y = 2 * Math.PI * e;
      if (trick.t >= 1) terminarManobra(true);
    }
    if (vy <= 1.5 && gCD <= 0) {
      for (const r of CORRIMAOS) {
        const rx = pos.x - r.ax, rz = pos.z - r.az, t = rx * r.dx + rz * r.dz;
        if (t > 0 && t < r.len && Math.abs(rx * r.dz - rz * r.dx) < 1.1 && Math.abs(pos.y - r.y) < 0.4) { iniciarGrind(r, t); break; }
      }
    }
    if (estado === 'ar') {
      const g = alturaEm(pos.x, pos.z);
      if (pos.y <= g) {
        if (g - pos.y > 0.6) { pos.x -= vh.x * dt; pos.z -= vh.y * dt; vh.set(0, 0); }  // bateu na lateral da rampa
        else if (vy <= 0) aterrissar(g);
      }
    }
  } else if (estado === 'grind') {
    railT += railSinal * railVel * dt;
    if (railT < 0 || railT > rail.len) { railT = THREE.MathUtils.clamp(railT, 0, rail.len); pos.x = rail.ax + rail.dx * railT; pos.z = rail.az + rail.dz * railT; sairGrind(false); }
    else {
      pos.set(rail.ax + rail.dx * railT, rail.y, rail.az + rail.dz * railT);
      for (gT += dt; gT >= CFG.grindIntervalo; gT -= CFG.grindIntervalo) {
        atividade(); pontosCombo = CFG.grindMultiplica ? Math.max(pontosCombo, 1) * 10 : pontosCombo + CFG.grindPontos * (railLado ? 1.5 : 1);
      }
      jogador.rotation.y = girarAte(jogador.rotation.y, railYaw, 15 * dt);
      if (pulo) sairGrind(true);
    }
  } else if (estado === 'queda' && (tEst -= dt) <= 0) {
    visual.rotation.x = 0; visual.position.y = 0.16; skate.rotation.set(0, 0, 0); setEstado('chao');
  }

  // Efeito de escala quando o modelo não tem animações
  if (animacaoProcedural) {
    let aY = 1, aXZ = 1;
    if (estado === 'agachando') { aY = 0.75; aXZ = 1.1; } else if (estado === 'ar') { aY = 1.08; aXZ = 0.95; } else if (tAterr > 0) { aY = 0.82; aXZ = 1.08; }
    const f = Math.min(1, 20 * dt); visual.scale.y += (aY - visual.scale.y) * f; visual.scale.x += (aXZ - visual.scale.x) * f; visual.scale.z = visual.scale.x;
  }
  if (tAterr > 0 && (tAterr -= dt) <= 0 && mixer && estado === 'chao') tocarAnim('parado');

  const t = Math.floor(total).toLocaleString('pt-BR');
  if (t !== ultTotal) { ultTotal = t; elTotal.textContent = t; pulsar(elTotal.parentElement); }
  const c = pontosCombo > 0 || mult > 1 ? `${pontosCombo.toLocaleString('pt-BR')} × ${mult}` : '';
  if (c !== ultCombo) { ultCombo = c; elCombo.textContent = c; if (c) pulsar(elCombo.parentElement); }
  const q = nCombos > 0 ? `${nCombos} ${nCombos === 1 ? 'combo seguido' : 'combos seguidos'}` : '';
  if (q !== ultSeq) { ultSeq = q; elSeq.textContent = q; }
  elPainel.dataset.n = Math.min(3, Math.floor(nCombos / CFG.combosPorNivel)); // 0 normal, 1 fogo, 2 fogo + raios, 3 tudo mais forte
  const f = tMult / CFG.tempoMult;                                              // termômetro dos 10 s (sem números)
  elTermo.style.opacity = mult > 1 ? 1 : 0; elTermo.classList.toggle('alerta', mult > 1 && f < 0.33);
  elTermoFill.style.height = `${f * 100}%`; elTermoFill.style.background = `hsl(${Math.round(120 * f)} 90% 50%)`;
  elTempo.textContent = `${Math.ceil(tempo)}s`; elTempo.style.color = tempo <= 10 ? '#ff3d7f' : '#fff';
}

// ---------- Câmera e loop ----------
reiniciar(); camera.position.set(THREE.MathUtils.clamp(pos.x - Math.sin(rumo) * 9, CAMLIM.x0, CAMLIM.x1), pos.y + 4.5, THREE.MathUtils.clamp(pos.z - Math.cos(rumo) * 9, CAMLIM.z0, CAMLIM.z1));
let camYaw = rumo; const alvoCam = new THREE.Vector3(), relogio = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(relogio.getDelta(), 0.05);
  atualizar(dt); if (mixer) mixer.update(dt);
  camYaw = girarAte(camYaw, rumo, 3 * dt);
  camera.fov = 65 + Math.min(Math.max(vel, 0), 28) * 0.5; camera.updateProjectionMatrix(); // sensação de velocidade
  if (jogando) alvoCam.set(pos.x - Math.sin(camYaw) * 9, pos.y * 0.5 + 4.5, pos.z - Math.cos(camYaw) * 9);
  else { const a = performance.now() / 8000; alvoCam.set(pos.x + Math.sin(a) * 18, pos.y + 5, pos.z + Math.cos(a) * 18); } // câmera orbita enquanto a tela inicial está aberta
  alvoCam.x = THREE.MathUtils.clamp(alvoCam.x, CAMLIM.x0, CAMLIM.x1); alvoCam.z = THREE.MathUtils.clamp(alvoCam.z, CAMLIM.z0, CAMLIM.z1);
  camera.position.lerp(alvoCam, 1 - Math.exp(-8 * dt)); camera.lookAt(pos.x, pos.y + 1.2, pos.z);
  sol.position.set(pos.x + 12, 25, pos.z + 10); sol.target.position.copy(pos);
  renderer.render(scene, camera);
});

// Carrega o parque; quando terminar, coloca o jogador na largada (já com o mapa de alturas) e libera o botão
carregarParque().then(() => {
  parqueOk = true; btnComecar.disabled = false; btnComecar.textContent = 'Clique para começar';
  reiniciar(); camYaw = rumo; camera.position.set(THREE.MathUtils.clamp(pos.x - Math.sin(rumo) * 9, CAMLIM.x0, CAMLIM.x1), pos.y + 4.5, THREE.MathUtils.clamp(pos.z - Math.cos(rumo) * 9, CAMLIM.z0, CAMLIM.z1));
});
