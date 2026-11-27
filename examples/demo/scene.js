import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { generateTown, TILE } from "../../packages/map-sdk/src/index.js";
import { STORY } from "../beginner-village/village.js";
import { sceneProps } from "./scene-layout.js";

const HOME = {
  position: new THREE.Vector3(15.2, 8.6, 31.4),
  target: new THREE.Vector3(23.4, 1.15, 14.2),
};
const node = (id) => document.getElementById(id);

function paintGround(map, image) {
  const scale = 32;
  const canvas = document.createElement("canvas");
  canvas.width = map.width * scale;
  canvas.height = map.height * scale;
  const context = canvas.getContext("2d");
  const region = {
    grass: [48, 28, 340, 200],
    path: [640, 220, 300, 260],
    water: [8, 300, 190, 300],
  };
  const stamp = (kind, x, y) => {
    const [sx, sy, sw, sh] = region[kind];
    const tile = 36;
    const u = (x * tile) % Math.max(1, sw - tile);
    const v = (y * tile) % Math.max(1, sh - tile);
    context.drawImage(image, sx + u, sy + v, tile, tile, x * scale, y * scale, scale, scale);
  };
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) stamp("grass", x, y);
  }
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.tiles[y][x];
      if (tile === TILE.WATER) {
        stamp("water", x, y);
        context.fillStyle = "rgba(28, 96, 122, 0.42)";
        context.fillRect(x * scale, y * scale, scale, scale);
      } else if (tile === TILE.PATH || tile === TILE.BRIDGE) {
        stamp("path", x, y);
      }
      if (tile === TILE.BRIDGE) {
        context.strokeStyle = "rgba(96, 68, 38, 0.45)";
        context.lineWidth = 2;
        context.strokeRect(x * scale + 5, y * scale + 4, scale - 10, scale - 8);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function blobTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 10, 64, 64, 62);
  gradient.addColorStop(0, "rgba(48, 34, 18, 0.5)");
  gradient.addColorStop(0.55, "rgba(48, 34, 18, 0.18)");
  gradient.addColorStop(1, "rgba(48, 34, 18, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sliceMaterial(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xfff4e8,
    transparent: true,
    alphaTest: 0.2,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = pow(max(texel.rgb, 0.0), vec3(0.94));
      color = mix(color, color * vec3(1.07, 0.98, 0.88), 0.5);
      float vignette = smoothstep(0.92, 0.38, distance(vUv, vec2(0.5)));
      gl_FragColor = vec4(color * vignette, texel.a);
    }
  `,
};

function fillStory() {
  const panel = node("story");
  panel.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = STORY.title;
  const summary = document.createElement("p");
  summary.textContent = STORY.summary;
  const summaryZh = document.createElement("p");
  summaryZh.className = "zh";
  summaryZh.textContent = STORY.summaryZh;
  const list = document.createElement("ol");
  for (const beat of STORY.beats) {
    const item = document.createElement("li");
    item.textContent = `${beat.title}. ${beat.text}`;
    const zh = document.createElement("span");
    zh.className = "zh";
    zh.textContent = beat.textZh;
    item.append(zh);
    list.append(item);
  }
  panel.append(title, summary, summaryZh, list);
}

async function loadImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function main() {
  fillStory();
  const map = generateTown({ layout: "organic", seed: 1042 });
  const [manifest, groundImage] = await Promise.all([
    fetch("./assets/stacks.json").then((response) => response.json()),
    loadImage("./assets/source/ground-concept.jpg"),
  ]);
  const loader = new THREE.TextureLoader();
  const materials = {};
  for (const [kind, spec] of Object.entries(manifest)) {
    materials[kind] = await Promise.all(spec.files.map(async (file) => sliceMaterial(await loader.loadAsync(`./assets/${file}`))));
  }

  const canvas = node("view");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0e0c6);
  scene.fog = new THREE.FogExp2(0xead8bc, 0.0065);
  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.08, 180);
  const introFrom = HOME.position.clone().add(new THREE.Vector3(-8, 7, 8));
  camera.position.copy(introFrom);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minPolarAngle = 0.18;
  controls.minDistance = 5;
  controls.maxDistance = 78;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffe6c2, 0x3d4a30, 0.72));
  const sun = new THREE.DirectionalLight(0xffc07a, 2.55);
  sun.position.set(18, 24, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 70;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.bias = -0.00035;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9eb6ff, 0.28);
  fill.position.set(-16, 10, 30);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(map.width, map.height),
    new THREE.MeshStandardMaterial({ map: paintGround(map, groundImage), roughness: 0.94, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.width / 2, 0, map.height / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const sliceGeometry = new THREE.PlaneGeometry(1, 1);
  sliceGeometry.rotateX(-Math.PI / 2);
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false,
  });
  const footprintMaterial = new THREE.MeshBasicMaterial({
    color: 0x783d30, transparent: true, opacity: 0.38, depthWrite: false,
  });
  const footprints = new THREE.Group();
  footprints.visible = false;
  scene.add(footprints);

  for (const prop of sceneProps(map)) {
    const spec = manifest[prop.kind];
    const group = new THREE.Group();
    group.position.set(prop.x, 0, prop.z);
    group.rotation.y = prop.yaw;
    const width = spec.fitFootprint ? prop.footprint.width * spec.plane : spec.plane;
    const depth = spec.fitFootprint ? prop.footprint.depth * spec.plane : spec.plane;
    materials[prop.kind].forEach((material, index) => {
      const slice = new THREE.Mesh(sliceGeometry, material);
      slice.scale.set(width, 1, depth);
      slice.position.y = 0.05 + index * spec.spacing;
      slice.castShadow = true;
      slice.receiveShadow = true;
      group.add(slice);
    });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    const shade = spec.fitFootprint ? Math.max(width, depth) * spec.shadow : spec.shadow * 2;
    shadow.scale.set(shade, 1, shade * 0.72);
    shadow.position.y = 0.03;
    group.add(shadow);
    scene.add(group);

    const box = new THREE.Mesh(new THREE.BoxGeometry(prop.footprint.width, 0.08, prop.footprint.depth), footprintMaterial);
    box.position.set(prop.x, 0.05, prop.z);
    footprints.add(box);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.55, 0.86));
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass());

  let intro = 1;
  controls.addEventListener("start", () => { intro = 0; });
  const frame = () => {
    requestAnimationFrame(frame);
    if (intro > 0) {
      intro = Math.max(0, intro - 0.016);
      const eased = 1 - intro * intro;
      camera.position.lerpVectors(introFrom, HOME.position, eased);
    }
    controls.update();
    composer.render();
  };
  frame();
  node("loading").hidden = true;

  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", resize);
  node("reset").addEventListener("click", () => {
    intro = 0;
    camera.position.copy(HOME.position);
    controls.target.copy(HOME.target);
    controls.update();
  });
  node("footprints").addEventListener("click", () => {
    footprints.visible = !footprints.visible;
    node("footprints").setAttribute("aria-pressed", String(footprints.visible));
  });
  node("story-toggle").addEventListener("click", () => {
    const open = node("story").hidden;
    node("story").hidden = !open;
    node("story-toggle").setAttribute("aria-pressed", String(open));
  });
}

main().catch((error) => {
  node("loading").textContent = error.message || String(error);
});
