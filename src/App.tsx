/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Play, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  HelpCircle, 
  Terminal as TerminalIcon, 
  X, 
  Keyboard, 
  Cpu, 
  Zap, 
  ShieldAlert, 
  Info, 
  Compass, 
  Check, 
  ChevronRight,
  Activity,
  Crosshair,
  Wifi,
  Thermometer,
  Grid,
  Heart
} from 'lucide-react';

// Key bindings interface
interface KeyBindings {
  forward: string;
  left: string;
  back: string;
  right: string;
  interact: string;
  ultimate: string;
}

// Default key bindings
const DEFAULT_BINDINGS: KeyBindings = {
  forward: 'W',
  left: 'A',
  back: 'S',
  right: 'D',
  interact: 'E',
  ultimate: 'Q',
};

// Combat log entry
interface LogEntry {
  id: string;
  text: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'danger' | 'system';
}

// Sound Synthesizer via Web Audio API (to provide premium, zero-latency tactical audio bleeps)
const playSound = (type: 'click' | 'remap' | 'shoot' | 'ultimate' | 'interact' | 'denied' | 'victory', enabled: boolean) => {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start();
        osc.stop(now + 0.08);
        break;

      case 'remap':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.setValueAtTime(1100, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start();
        osc.stop(now + 0.15);
        break;

      case 'shoot':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.1);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start();
        osc.stop(now + 0.1);
        break;

      case 'ultimate':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.7);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.7);
        osc.start();
        osc.stop(now + 0.7);
        break;

      case 'interact':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start();
        osc.stop(now + 0.15);
        break;

      case 'victory':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start();
        osc.stop(now + 0.4);
        break;

      case 'denied':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start();
        osc.stop(now + 0.15);
        break;
    }
  } catch (e) {
    // Gracefully handle browser blocked audio context
  }
};

export default function App() {
  // Navigation & Screen States
  const [currentScreen, setCurrentScreen] = useState<'menu' | 'game' | 'credits'>('menu');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);

  // Player Health, Game Over, and Spawning Items
  const [playerHealth, setPlayerHealth] = useState<number>(5);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [itemUrl, setItemUrl] = useState<string>('https://raw.githubusercontent.com/banyapon/banyapon.github.io/refs/heads/main/studio/images/item.png');

  const [items, setItems] = useState<{ id: number; x: number; z: number; collected: boolean }[]>(() => {
    const initialItems = [];
    for (let i = 0; i < 6; i++) {
      initialItems.push({
        id: i,
        x: (Math.random() - 0.5) * 44, // distributed randomly on 50x50 ground (-22 to 22)
        z: (Math.random() - 0.5) * 44,
        collected: false
      });
    }
    return initialItems;
  });
  
  // Custom Mappable key bindings
  const [bindings, setBindings] = useState<KeyBindings>(() => {
    const saved = localStorage.getItem('neon_strike_bindings_r3f');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_BINDINGS;
      }
    }
    return DEFAULT_BINDINGS;
  });
  
  const [remappingKey, setRemappingKey] = useState<keyof KeyBindings | null>(null);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState<boolean>(false);
  const [latency, setLatency] = useState<number>(24);
  const [fps, setFps] = useState<number>(144);
  const [gpuTemp, setGpuTemp] = useState<number>(64);
  
  // Combat logger
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', text: 'TACTICAL INTERFACE LAUNCHED SUCCESSFULLY', timestamp: '20:00:00', type: 'system' },
    { id: '2', text: 'GLOWING NEON GROUND PLANE EXPANDED (SIZE: 50x50)', timestamp: '20:00:01', type: 'info' },
    { id: '3', text: 'PRESS [ENTER GAME] TO JOIN THE CHIP CHAMBER', timestamp: '20:00:02', type: 'info' }
  ]);

  // Asset validation triggers
  const [logoLoaded, setLogoLoaded] = useState<boolean>(true);
  const [playerLoaded, setPlayerLoaded] = useState<boolean>(true);

  // Global game state synchronized from three.js to HUD
  const [score, setScore] = useState<number>(0);
  const [terminalProgress, setTerminalProgress] = useState<number>(0);
  const [ultimateCharge, setUltimateCharge] = useState<number>(0);
  const [isHacking, setIsHacking] = useState<boolean>(false);
  const [currentDirection, setCurrentDirection] = useState<string>('N');
  const [playerCoords, setPlayerCoords] = useState<{x: number, z: number}>({ x: 0, z: 0 });

  // Key tracking dictionary
  const keysPressed = useRef<Record<string, boolean>>({});

  // Telemetry simulator
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(prev => Math.max(12, Math.min(35, prev + Math.floor(Math.random() * 5) - 2)));
      setFps(prev => Math.max(138, Math.min(144, prev + Math.floor(Math.random() * 3) - 1)));
      setGpuTemp(prev => Math.max(58, Math.min(65, prev + Math.floor(Math.random() * 3) - 1)));
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Save bindings helper
  const saveBindings = (newBindings: KeyBindings) => {
    setBindings(newBindings);
    localStorage.setItem('neon_strike_bindings_r3f', JSON.stringify(newBindings));
  };

  // Log logger
  const addLog = (text: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0];
    setLogs(prev => [
      { id: Date.now().toString() + Math.random(), text: text.toUpperCase(), timestamp, type },
      ...prev.slice(0, 15)
    ]);
  };

  // Keyboard binding listener in "remapping" active state
  useEffect(() => {
    if (!remappingKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keyName = e.key.toUpperCase();
      if (e.key === 'Escape') {
        setRemappingKey(null);
        playSound('denied', audioEnabled);
        addLog('Remapping action aborted.', 'warning');
        return;
      }

      // Detect duplicates
      const exists = Object.entries(bindings).some(([k, v]) => k !== remappingKey && v === keyName);
      if (exists) {
        playSound('denied', audioEnabled);
        addLog(`Conflict: Key ${keyName} is already assigned!`, 'danger');
        setRemappingKey(null);
        return;
      }

      const updated = { ...bindings, [remappingKey]: keyName };
      saveBindings(updated);
      playSound('remap', audioEnabled);
      addLog(`Rebound [${remappingKey.toUpperCase()}] trigger to key "${keyName}"`, 'success');
      setRemappingKey(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [remappingKey, bindings, audioEnabled]);

  // Window keyboard listener for driving 3D action
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      keysPressed.current[k] = true;

      // Escape key returns to menu
      if (e.key === 'Escape' && currentScreen === 'game') {
        playSound('click', audioEnabled);
        setCurrentScreen('menu');
        addLog('Exited battle chamber.', 'info');
      }
    };

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      keysPressed.current[k] = false;
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('keyup', handleGlobalKeyUp);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('keyup', handleGlobalKeyUp);
    };
  }, [currentScreen, audioEnabled]);

  // Procedural canvas textures
  const groundTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Cyberpunk grid background
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, 512, 512);

    // Grid coordinates markers & styling
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 6;

    const step = 64;
    for (let i = 0; i <= 512; i += step) {
      // Main grid lines
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Minor faint orange lines
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.25)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    for (let i = step / 2; i < 512; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Tech text details printed in corners
    ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.font = '10px monospace';
    for (let x = step; x < 512; x += step * 2) {
      for (let y = step; y < 512; y += step * 2) {
        ctx.fillText(`[${x/10},${y/10}]`, x + 6, y - 6);
      }
    }

    // Glowing core tech decals
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 44, 44);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10); // tile repeat over size 50 Ground Plane
    return texture;
  }, []);

  // Cyber fallback avatar when player.png takes time or fails
  const playerFallbackTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Transparent backdrop
    ctx.clearRect(0, 0, 128, 128);

    // Futuristic glowing holographic target robot
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 12;

    // Body triangle
    ctx.beginPath();
    ctx.moveTo(64, 15);
    ctx.lineTo(105, 100);
    ctx.lineTo(23, 100);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
    ctx.fill();
    ctx.stroke();

    // Eye visor glow
    ctx.beginPath();
    ctx.moveTo(48, 55);
    ctx.lineTo(80, 55);
    ctx.strokeStyle = '#f97316';
    ctx.shadowColor = '#f97316';
    ctx.lineWidth = 6;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }, []);

  // Target Drone sprite texture
  const droneTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);

    // Drone circle body
    ctx.beginPath();
    ctx.arc(64, 64, 40, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.stroke();

    // Glowing eye
    ctx.beginPath();
    ctx.arc(64, 64, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }, []);

  // Player sprite texture loader (loaded safely in React)
  const [playerTexture, setPlayerTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      'https://raw.githubusercontent.com/banyapon/banyapon.github.io/refs/heads/main/studio/images/player.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setPlayerTexture(tex);
        setPlayerLoaded(true);
        addLog('Futuristic player texture loaded successfully.', 'success');
      },
      undefined,
      () => {
        setPlayerLoaded(false);
        addLog('Online sprite failed to load. Initiating neon mecha vector fallback.', 'warning');
      }
    );
  }, []);

  // Glowing energy item fallback texture
  const itemFallbackTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Transparent backdrop
    ctx.clearRect(0, 0, 256, 256);

    // Draw a glowing sci-fi power-up heart/crystal
    ctx.strokeStyle = '#22c55e'; // Green for healing/energy
    ctx.lineWidth = 10;
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 24;

    // Glowing diamond shape
    ctx.beginPath();
    ctx.moveTo(128, 44);
    ctx.lineTo(212, 128);
    ctx.lineTo(128, 212);
    ctx.lineTo(44, 128);
    ctx.closePath();
    
    // Fill with gradient
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 110);
    grad.addColorStop(0, 'rgba(34, 197, 94, 0.95)');
    grad.addColorStop(0.5, 'rgba(34, 197, 94, 0.45)');
    grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.stroke();

    // Core glowing cross details
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    
    ctx.beginPath();
    ctx.moveTo(128, 88);
    ctx.lineTo(128, 168);
    ctx.moveTo(88, 128);
    ctx.lineTo(168, 128);
    ctx.stroke();

    return new THREE.CanvasTexture(canvas);
  }, []);

  const [itemTexture, setItemTexture] = useState<THREE.Texture | null>(null);
  const [itemLoaded, setItemLoaded] = useState<boolean>(true);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      itemUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setItemTexture(tex);
        setItemLoaded(true);
        addLog('Custom item texture loaded successfully.', 'success');
      },
      undefined,
      () => {
        setItemLoaded(false);
        addLog('Custom item URL failed. Using emerald crystal fallback.', 'warning');
      }
    );
  }, [itemUrl]);

  // Target Enemy sprite texture sheet (256x256, 4 frames, 2 columns, 2 rows)
  const [enemyTexture, setEnemyTexture] = useState<THREE.Texture | null>(null);
  const [enemyLoaded, setEnemyLoaded] = useState<boolean>(true);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      'https://raw.githubusercontent.com/banyapon/banyapon.github.io/refs/heads/main/studio/images/enemy.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        setEnemyTexture(tex);
        setEnemyLoaded(true);
        addLog('Custom walking enemy texture loaded successfully.', 'success');
      },
      undefined,
      () => {
        setEnemyLoaded(false);
        addLog('Custom enemy URL failed to load. Initiating alien vector fallback.', 'warning');
      }
    );
  }, []);

  const enemyFallbackTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);

    // Alien fallback icon
    ctx.beginPath();
    ctx.arc(128, 128, 80, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 12;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(80, 110, 96, 36);

    return new THREE.CanvasTexture(canvas);
  }, []);

interface EnemySpriteProps {
  texture: THREE.Texture | null;
  fallbackTexture: THREE.Texture;
  frame: number;
  flipX: boolean;
  isAttacking: boolean;
  isDying: boolean;
  stateTime: number;
}

const EnemySprite: React.FC<EnemySpriteProps> = ({ 
  texture, 
  fallbackTexture, 
  frame, 
  flipX, 
  isAttacking, 
  isDying, 
  stateTime 
}) => {
  const clonedTexture = useMemo(() => {
    if (!texture) return null;
    const t = texture.clone();
    t.repeat.set(0.5, 0.5);
    t.needsUpdate = true;
    return t;
  }, [texture]);

  useEffect(() => {
    if (!clonedTexture) return;
    // Frame mapping:
    // Standing (Row 1): Frame 0, 1
    // Walking (Row 2): Frame 2, 3
    let col = 0;
    let row = 0; // WebGL texture bottom-left coordinates start at (0,0). Bottom row is Row 2 (Walking), top is Row 1 (Standing).
    if (frame === 0) { col = 0; row = 1; }
    else if (frame === 1) { col = 1; row = 1; }
    else if (frame === 2) { col = 0; row = 0; }
    else if (frame === 3) { col = 1; row = 0; }

    clonedTexture.offset.set(col * 0.5, row * 0.5);
    clonedTexture.needsUpdate = true;
  }, [clonedTexture, frame]);

  let isVisible = true;
  if (isDying) {
    // Flash white rapidly on death
    isVisible = Math.sin(stateTime * 45) > 0;
  }

  // Flash red on attack (tint texture red)
  const color = (isAttacking && Math.sin(stateTime * 15) > 0) ? '#ff4444' : '#ffffff';

  if (!isVisible) return null;

  return (
    <sprite scale={[flipX ? -2.2 : 2.2, 2.2, 1]}>
      <spriteMaterial 
        map={clonedTexture || fallbackTexture} 
        transparent 
        depthWrite={false} 
        color={color}
      />
    </sprite>
  );
};

  // Inner R3F Scene World Component
  function GameWorld() {
    const { camera } = useThree();
    
    // Player coordinate position
    const playerPos = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.2, 0));
    const [localCoords, setLocalCoords] = useState<{x: number, z: number}>({ x: 0, z: 0 });
    const [bobbing, setBobbing] = useState<number>(0);
    const [spriteDirection, setSpriteDirection] = useState<'left' | 'right'>('right');

    // Laser bullet tracker
    const [bullets, setBullets] = useState<any[]>([]);
    const lastShootTime = useRef<number>(0);

    // Ground-walking enemies using custom sprite sheets (re-using state name 'drones')
    const [drones, setDrones] = useState<any[]>(() => {
      const initialEnemies = [];
      for (let i = 1; i <= 4; i++) {
        const angle = (i * Math.PI) / 2;
        initialEnemies.push({
          id: i,
          x: Math.cos(angle) * 18,
          z: Math.sin(angle) * 18,
          health: 2, // 2 hits to defeat
          hitCount: 0,
          knockbackX: 0,
          knockbackZ: 0,
          speed: 2.2 + Math.random() * 0.8,
          animFrame: 0,
          animTimer: 0,
          dying: false,
          dieTime: 0
        });
      }
      return initialEnemies;
    });

    // Hacking terminal
    const terminalPos = new THREE.Vector3(0, 0, -8);
    const terminalRadius = 3;

    // Expand wave logic
    const [ultWave, setUltWave] = useState<{ active: boolean; radius: number; maxRadius: number }>({ active: false, radius: 0, maxRadius: 18 });

    const lastHitTime = useRef<number>(0);
    const playerSpriteRef = useRef<THREE.Sprite>(null);

    // Handle game input mechanics and coordinate logs inside three loop ticker
    useFrame((state, delta) => {
      if (gameOver) {
        return;
      }

      // 1. Move Player in 8 directions
      const { forward, left, back, right, interact, ultimate } = bindings;
      let moveX = 0;
      let moveZ = 0;

      if (keysPressed.current[forward]) moveZ -= 1;
      if (keysPressed.current[back]) moveZ += 1;
      if (keysPressed.current[left]) moveX -= 1;
      if (keysPressed.current[right]) moveX += 1;

      // Detect direction tags for 8 directions output
      let dirStr = '';
      if (moveZ < 0 && moveX === 0) dirStr = 'N (NORTH)';
      else if (moveZ < 0 && moveX > 0) dirStr = 'NE (NORTH-EAST)';
      else if (moveX > 0 && moveZ === 0) dirStr = 'E (EAST)';
      else if (moveZ > 0 && moveX > 0) dirStr = 'SE (SOUTH-EAST)';
      else if (moveZ > 0 && moveX === 0) dirStr = 'S (SOUTH)';
      else if (moveZ > 0 && moveX < 0) dirStr = 'SW (SOUTH-WEST)';
      else if (moveX < 0 && moveZ === 0) dirStr = 'W (WEST)';
      else if (moveZ < 0 && moveX < 0) dirStr = 'NW (NORTH-WEST)';

      if (dirStr) {
        setCurrentDirection(dirStr);
      }

      // Check horizontal sprite flipping
      if (moveX < 0) setSpriteDirection('left');
      if (moveX > 0) setSpriteDirection('right');

      // Normalize diagonal speed vector
      if (moveX !== 0 && moveZ !== 0) {
        moveX *= 0.7071;
        moveZ *= 0.7071;
      }

      const currentSpeed = 8 * delta; // speed factor
      const nextX = playerPos.current.x + moveX * currentSpeed;
      const nextZ = playerPos.current.z + moveZ * currentSpeed;

      // Keep inside Ground Plane boundary (size 50, limits at -24.5 to 24.5)
      playerPos.current.x = Math.max(-24, Math.min(24, nextX));
      playerPos.current.z = Math.max(-24, Math.min(24, nextZ));

      // Gentle sprite movement walking animation bob
      if (moveX !== 0 || moveZ !== 0) {
        setBobbing(Math.sin(state.clock.getElapsedTime() * 14) * 0.15);
      } else {
        setBobbing(0);
      }

      // Sync state coords to react HUD state
      if (Math.abs(playerPos.current.x - localCoords.x) > 0.1 || Math.abs(playerPos.current.z - localCoords.z) > 0.1) {
        setLocalCoords({ x: playerPos.current.x, z: playerPos.current.z });
        setPlayerCoords({ x: playerPos.current.x, z: playerPos.current.z });
      }

      // A. Damage check: Contact damage from living, walking enemies with invulnerability frames
      const nowTime = state.clock.getElapsedTime();
      if (nowTime - lastHitTime.current > 1.5) {
        let hitByEnemy = false;
        drones.forEach(d => {
          if (d.dying) return; // ignore dying enemies
          const dist = Math.hypot(playerPos.current.x - d.x, playerPos.current.z - d.z);
          if (dist < 1.4) {
            hitByEnemy = true;
          }
        });

        if (hitByEnemy) {
          lastHitTime.current = nowTime;
          setPlayerHealth(hp => {
            const nextHp = Math.max(0, hp - 1);
            if (nextHp === 0) {
              setGameOver(true);
              playSound('denied', audioEnabled);
              addLog('CRITICAL DAMAGE! SIMULATOR OFFLINE. GAME OVER!', 'danger');
            } else {
              playSound('denied', audioEnabled);
              addLog(`CRITICAL HIT! SHIELD DEFLECTED. HEALTH CELL REMAINING: ${nextHp}/5`, 'danger');
            }
            return nextHp;
          });
        }
      }

      // B. Handle player flashing indicator when invulnerable
      if (playerSpriteRef.current) {
        const isInvulnerable = nowTime - lastHitTime.current < 1.5;
        if (isInvulnerable) {
          playerSpriteRef.current.material.opacity = Math.sin(state.clock.getElapsedTime() * 25) > 0 ? 0.2 : 0.8;
        } else {
          playerSpriteRef.current.material.opacity = 1.0;
        }
      }

      // C. Item collision detection for healing
      items.forEach(item => {
        if (!item.collected) {
          const dist = Math.hypot(playerPos.current.x - item.x, playerPos.current.z - item.z);
          if (dist < 1.5) {
            // Collect item!
            playSound('victory', audioEnabled);
            setPlayerHealth(hp => Math.min(5, hp + 1));
            setScore(s => s + 150);
            addLog('DECRYPTED SECURE ENERGY CAPSULE! LIVES RESTORED (+1)', 'success');

            // Move item to fresh random coordinate
            setItems(currentItems => {
              return currentItems.map(it => {
                if (it.id === item.id) {
                  return {
                    ...it,
                    x: (Math.random() - 0.5) * 44,
                    z: (Math.random() - 0.5) * 44,
                    collected: false
                  };
                }
                return it;
              });
            });
          }
        }
      });

      // 2. Camera follow (smooth linear interpolation)
      const idealCamX = playerPos.current.x;
      const idealCamY = playerPos.current.y + 7;
      const idealCamZ = playerPos.current.z + 10;

      camera.position.x += (idealCamX - camera.position.x) * 0.08;
      camera.position.y += (idealCamY - camera.position.y) * 0.08;
      camera.position.z += (idealCamZ - camera.position.z) * 0.08;
      camera.lookAt(playerPos.current.x, playerPos.current.y, playerPos.current.z);

      // 3. Update ground enemies chasing AI & animation frames
      setDrones(prevDrones => {
        return prevDrones.map(d => {
          if (d.dying) {
            // Dying animation update: fly away at high velocity + spin
            const t = (Date.now() * 0.001) - d.dieTime;
            if (t > 0.8) {
              // Reset/respawn the enemy at a random boundary coordinate!
              const angle = Math.random() * Math.PI * 2;
              return {
                id: d.id,
                x: Math.cos(angle) * 22,
                z: Math.sin(angle) * 22,
                health: 2,
                hitCount: 0,
                knockbackX: 0,
                knockbackZ: 0,
                speed: 2.2 + Math.random() * 0.8,
                animFrame: 0,
                animTimer: 0,
                dying: false,
                dieTime: 0
              };
            }
            
            // Flying knockback off-screen animation
            return {
              ...d,
              x: d.x + d.knockbackX * delta,
              z: d.z + d.knockbackZ * delta,
              knockbackX: d.knockbackX * 0.94,
              knockbackZ: d.knockbackZ * 0.94,
            };
          }

          // Apply decaying slide knockback if hit
          let nextX = d.x + (d.knockbackX || 0) * delta;
          let nextZ = d.z + (d.knockbackZ || 0) * delta;
          const nextKnockbackX = (d.knockbackX || 0) * 0.85;
          const nextKnockbackZ = (d.knockbackZ || 0) * 0.85;

          // Target movement: travel towards player position
          const dx = playerPos.current.x - nextX;
          const dz = playerPos.current.z - nextZ;
          const dist = Math.hypot(dx, dz);

          let isWalking = true;
          let frame = d.animFrame;
          let timer = d.animTimer + delta;

          if (dist > 1.3) {
            // Move towards player
            const dirX = dx / (dist || 1);
            const dirZ = dz / (dist || 1);
            
            // Only walk towards player if not under heavy knockback slide
            const speedFactor = Math.hypot(nextKnockbackX, nextKnockbackZ) > 4 ? 0.15 : 1.0;
            nextX += dirX * d.speed * speedFactor * delta;
            nextZ += dirZ * d.speed * speedFactor * delta;
            isWalking = true;
          } else {
            // Near player: stop and attack player
            isWalking = false;
          }

          // Cycle frames: Row 1 = Stand (0, 1), Row 2 = Walk (2, 3) at 6 FPS
          if (timer > 0.16) {
            timer = 0;
            if (isWalking) {
              frame = frame === 2 ? 3 : 2;
            } else {
              frame = frame === 0 ? 1 : 0;
            }
          }

          // Force correct frame ranges
          if (isWalking && (frame < 2 || frame > 3)) {
            frame = 2;
          } else if (!isWalking && (frame < 0 || frame > 1)) {
            frame = 0;
          }

          return {
            ...d,
            x: Math.max(-24, Math.min(24, nextX)),
            z: Math.max(-24, Math.min(24, nextZ)),
            knockbackX: nextKnockbackX,
            knockbackZ: nextKnockbackZ,
            animFrame: frame,
            animTimer: timer
          };
        });
      });

      // 4. Automated weapon fire target selector
      const now = state.clock.getElapsedTime();
      if (now - lastShootTime.current > 0.4 && drones.length > 0) {
        // Find nearest living enemy target
        let nearest: any = null;
        let minDist = Infinity;
        drones.forEach(d => {
          if (d.dying) return;
          const dist = Math.hypot(d.x - playerPos.current.x, d.z - playerPos.current.z);
          if (dist < minDist) {
            minDist = dist;
            nearest = d;
          }
        });

        // Shoot laser if inside radar scope
        if (nearest && minDist < 15) {
          const dir = new THREE.Vector3(nearest.x - playerPos.current.x, 0.4, nearest.z - playerPos.current.z).normalize();
          setBullets(b => [...b, {
            id: Math.random(),
            pos: new THREE.Vector3(playerPos.current.x, playerPos.current.y, playerPos.current.z),
            dir,
            life: 0.8 // lifetime seconds
          }]);
          lastShootTime.current = now;
          playSound('shoot', audioEnabled);
        }
      }

      // 5. Update projectiles movement and check collision
      setBullets(prev => {
        const kept: any[] = [];
        prev.forEach(b => {
          b.pos.addScaledVector(b.dir, 20 * delta); // travel velocity
          b.life -= delta;

          let hit = false;
          // check hits against enemies
          setDrones(currentDrones => {
            return currentDrones.map(d => {
              if (d.dying) return d;
              const dist = Math.hypot(b.pos.x - d.x, b.pos.z - d.z);
              if (dist < 1.4 && !hit) {
                hit = true;
                playSound('click', audioEnabled);
                setScore(s => s + 50);
                setUltimateCharge(charge => Math.min(100, charge + 8));

                const nextHitCount = d.hitCount + 1;
                if (nextHitCount >= 2) {
                  // Hit 2: Die & Fly away off-screen, flashing white rapidly
                  playSound('victory', audioEnabled);
                  setScore(s => s + 250);
                  addLog(`NEUTRALIZED: Enemy ${d.id} blasted off matrix plane!`, 'success');

                  const pushX = d.x - playerPos.current.x;
                  const pushZ = d.z - playerPos.current.z;
                  const len = Math.hypot(pushX, pushZ) || 1;

                  return {
                    ...d,
                    hitCount: 2,
                    dying: true,
                    dieTime: Date.now() * 0.001,
                    knockbackX: (pushX / len) * 55, // massive launch away speed
                    knockbackZ: (pushZ / len) * 55,
                  };
                } else {
                  // Hit 1: Knockback slide backward opposite to their moving direction (away from player)
                  addLog(`DIRECT HIT: Enemy ${d.id} hit 1/2 (Knocked back)`, 'warning');
                  
                  const pushX = d.x - playerPos.current.x;
                  const pushZ = d.z - playerPos.current.z;
                  const len = Math.hypot(pushX, pushZ) || 1;

                  return {
                    ...d,
                    hitCount: 1,
                    knockbackX: (pushX / len) * 25, // strong pushback slide speed
                    knockbackZ: (pushZ / len) * 25,
                  };
                }
              }
              return d;
            });
          });

          if (!hit && b.life > 0) {
            kept.push(b);
          }
        });
        return kept;
      });

      // 6. Interactive terminal decryption hack trigger
      const terminalDist = Math.hypot(playerPos.current.x - terminalPos.x, playerPos.current.z - terminalPos.z);
      if (terminalDist < terminalRadius + 1.2) {
        if (keysPressed.current[interact]) {
          setIsHacking(true);
          setTerminalProgress(prev => {
            const next = Math.min(100, prev + 0.15);
            if (next === 100 && prev < 100) {
              playSound('victory', audioEnabled);
              addLog('Decrypt key compiled! Central database access granted!', 'success');
              setScore(s => s + 800);
            }
            return next;
          });
          if (Math.random() < 0.15) {
            playSound('interact', audioEnabled);
          }
        } else {
          setIsHacking(false);
        }
      } else {
        setIsHacking(false);
      }

      // 7. Ultimate trigger wave updater
      if (ultWave.active) {
        const nextRadius = ultWave.radius + 15 * delta;
        if (nextRadius >= ultWave.maxRadius) {
          setUltWave({ active: false, radius: 0, maxRadius: 18 });
        } else {
          setUltWave(prev => ({ ...prev, radius: nextRadius }));
          // Hit enemies in blast range
          setDrones(currentDrones => {
            return currentDrones.map(d => {
              if (d.dying) return d;
              const dist = Math.hypot(playerPos.current.x - d.x, playerPos.current.z - d.z);
              if (dist < nextRadius && dist > nextRadius - 2.5) {
                playSound('victory', audioEnabled);
                setScore(s => s + 300);
                addLog(`ULTIMATE OBLITERATION: Blasted Enemy ${d.id}!`, 'success');

                const pushX = d.x - playerPos.current.x;
                const pushZ = d.z - playerPos.current.z;
                const len = Math.hypot(pushX, pushZ) || 1;

                return {
                  ...d,
                  hitCount: 2,
                  dying: true,
                  dieTime: Date.now() * 0.001,
                  knockbackX: (pushX / len) * 60, // ultimate high launch away speed
                  knockbackZ: (pushZ / len) * 60,
                };
              }
              return d;
            });
          });
        }
      }

      // 8. Custom Ultimate Action event listener
      if (keysPressed.current[ultimate] && ultimateCharge >= 100 && !ultWave.active) {
        setUltimateCharge(0);
        setUltWave({ active: true, radius: 1, maxRadius: 18 });
        playSound('ultimate', audioEnabled);
        addLog('Ulitmate strike blast unleashed across sector 50!', 'danger');
      }

    });

    return (
      <>
        {/* Sky light settings */}
        <ambientLight intensity={0.65} />
        <pointLight position={[0, 10, 0]} intensity={1.5} color="#06b6d4" />
        <pointLight position={[playerPos.current.x, 2, playerPos.current.z]} intensity={2.5} color="#f97316" distance={8} />

        {/* Dynamic 3D Sky Dome grid lines */}
        <gridHelper args={[60, 30, '#06b6d4', '#1e293b']} position={[0, -0.05, 0]} />

        {/* Main Ground Plane 50 texturing */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial 
            map={groundTexture} 
            roughness={0.7}
            metalness={0.1}
          />
        </mesh>

        {/* Central Hacker Terminal */}
        <group position={[terminalPos.x, 0, terminalPos.z]}>
          {/* Outer Ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <ringGeometry args={[terminalRadius - 0.5, terminalRadius + 0.2, 32]} />
            <meshBasicMaterial color={isHacking ? '#06b6d4' : '#f97316'} side={THREE.DoubleSide} transparent opacity={0.75} />
          </mesh>

          {/* Central Obelisk Pillar core */}
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.4, 0.8, 3, 4]} />
            <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.9} emissive={isHacking ? '#06b6d4' : '#ea580c'} emissiveIntensity={0.8} />
          </mesh>

          {/* Holographic glowing rings above core */}
          <mesh position={[0, 3.2, 0]} rotation={[Math.sin(Date.now() * 0.002) * 0.4, Date.now() * 0.001, 0]}>
            <torusGeometry args={[0.7, 0.08, 8, 24]} />
            <meshBasicMaterial color="#06b6d4" />
          </mesh>
        </group>

        {/* Outer glowing cyberpunk technical column borders to define the limits */}
        {[
          [-24, -24], [-24, 24], [24, -24], [24, 24],
          [0, -24], [0, 24], [-24, 0], [24, 0]
        ].map(([cx, cz], idx) => (
          <group position={[cx, 0, cz]} key={idx}>
            <mesh position={[0, 4, 0]}>
              <boxGeometry args={[1, 8, 1]} />
              <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.8} emissive="#f97316" emissiveIntensity={0.3} />
            </mesh>
            <pointLight position={[0, 8, 0]} color="#f97316" intensity={1} distance={10} />
          </group>
        ))}

        {/* Hacking warning alerts labels as 3D Billboards */}
        <Billboard position={[terminalPos.x, 4.2, terminalPos.z]}>
          <group>
            {/* Visual background box */}
            <mesh position={[0, 0, -0.05]}>
              <planeGeometry args={[4.5, 1]} />
              <meshBasicMaterial color="#000" transparent opacity={0.8} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <ringGeometry args={[2, 2.05, 4]} />
              <meshBasicMaterial color="#f97316" />
            </mesh>
          </group>
        </Billboard>

        {/* 2D Player Billboard character sprite facing the camera */}
        <sprite 
          ref={playerSpriteRef}
          position={[playerPos.current.x, playerPos.current.y + bobbing, playerPos.current.z]} 
          scale={[spriteDirection === 'left' ? -2.4 : 2.4, 2.4, 1]}
        >
          <spriteMaterial 
            map={playerTexture || playerFallbackTexture} 
            transparent 
            depthWrite={false} 
          />
        </sprite>

        {/* Floating text stats tag over player head */}
        <Billboard position={[playerPos.current.x, playerPos.current.y + 1.8 + bobbing, playerPos.current.z]}>
          <group>
            {/* Health line indicators */}
            <mesh position={[0, 0, 0]}>
              <planeGeometry args={[1.5, 0.12]} />
              <meshBasicMaterial color="#ef4444" />
            </mesh>
            {/* Custom glowing compass sign */}
            <mesh position={[0, -0.3, 0]}>
              <planeGeometry args={[1.2, 0.28]} />
              <meshBasicMaterial color="#0284c7" />
            </mesh>
          </group>
        </Billboard>

        {/* Holographic Glowing Compass Ring under the player's feet */}
        <mesh rotation={[-Math.PI / 2, 0, Date.now() * 0.001]} position={[playerPos.current.x, 0.03, playerPos.current.z]}>
          <ringGeometry args={[0.9, 1.05, 32]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        
        {/* Front Direction Indicator arrow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[playerPos.current.x, 0.04, playerPos.current.z - 1.2]}>
          <coneGeometry args={[0.2, 0.5, 3]} />
          <meshBasicMaterial color="#f97316" />
        </mesh>

        {/* Render Ground Enemies (custom animated spritesheet) */}
        {drones.map((d) => {
          // Flip horizontally based on player position relative to enemy
          const flipX = playerPos.current.x > d.x;

          // Enemy is close to player (contact range < 1.4)
          const isAttacking = Math.hypot(playerPos.current.x - d.x, playerPos.current.z - d.z) < 1.5;

          const timeSec = Date.now() * 0.001;

          return (
            <group position={[d.x, d.dying ? 1.2 + (timeSec - d.dieTime) * 12 : 1.2, d.z]} key={d.id}>
              {/* Ground shadow beneath enemy */}
              {!d.dying && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]}>
                  <ringGeometry args={[0.1, 0.6, 16]} />
                  <meshBasicMaterial color="#000000" transparent opacity={0.5} side={THREE.DoubleSide} />
                </mesh>
              )}

              {/* Glowing hazard circle under enemy feet */}
              {!d.dying && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.08, 0]}>
                  <ringGeometry args={[0.5, 0.65, 16]} />
                  <meshBasicMaterial color={isAttacking ? '#ff3333' : '#ea580c'} transparent opacity={0.3} side={THREE.DoubleSide} />
                </mesh>
              )}

              {/* Character Animated Sprite */}
              <EnemySprite 
                texture={enemyTexture} 
                fallbackTexture={enemyFallbackTexture} 
                frame={d.animFrame} 
                flipX={flipX} 
                isAttacking={isAttacking} 
                isDying={d.dying} 
                stateTime={timeSec} 
              />

              {/* Floating health dots / indicators over enemy head (2 hits to defeat) */}
              {!d.dying && (
                <Billboard position={[0, 1.4, 0]}>
                  <mesh>
                    <planeGeometry args={[0.8, 0.15]} />
                    <meshBasicMaterial color="#1e293b" transparent opacity={0.8} />
                  </mesh>
                  {/* Health bars indicators */}
                  <mesh position={[0, 0, 0.01]}>
                    <planeGeometry args={[0.75 * (2 - (d.hitCount || 0)) / 2, 0.08]} />
                    <meshBasicMaterial color={d.hitCount === 1 ? '#eab308' : '#22c55e'} />
                  </mesh>
                </Billboard>
              )}
            </group>
          );
        })}

        {/* Laser beam projectiles meshes */}
        {bullets.map((b) => (
          <mesh position={[b.pos.x, b.pos.y, b.pos.z]} key={b.id}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshBasicMaterial color="#22d3ee" />
          </mesh>
        ))}

        {/* Render Spawning Falling Items */}
        {items.map((item) => (
          <group position={[item.x, 1.0 + Math.sin(Date.now() * 0.003 + item.id) * 0.15, item.z]} key={item.id}>
            <sprite scale={[1.4, 1.4, 1]}>
              <spriteMaterial map={itemTexture || itemFallbackTexture} transparent depthWrite={false} />
            </sprite>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
              <ringGeometry args={[0.1, 0.45, 16]} />
              <meshBasicMaterial color="#22c55e" transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}

        {/* Ultimate shockwave sphere visual */}
        {ultWave.active && (
          <mesh position={[playerPos.current.x, 0.2, playerPos.current.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[ultWave.radius - 0.4, ultWave.radius + 0.2, 64]} />
            <meshBasicMaterial color="#f97316" side={THREE.DoubleSide} transparent opacity={1 - ultWave.radius / ultWave.maxRadius} />
          </mesh>
        )}

      </>
    );
  }

  // Restart demo game variables
  const resetStats = () => {
    setScore(0);
    setTerminalProgress(0);
    setUltimateCharge(0);
    setPlayerHealth(5);
    setGameOver(false);
    setItems(prev => prev.map(it => ({
      ...it,
      x: (Math.random() - 0.5) * 44,
      z: (Math.random() - 0.5) * 44,
      collected: false
    })));
    addLog('Chamber field reset complete.', 'system');
    playSound('click', audioEnabled);
  };

  return (
    <div id="game-viewport-container" className="w-full h-screen bg-[#050507] text-[#f0f0f0] flex flex-col overflow-hidden font-sans select-none relative">
      
      {/* Editorial Aesthetic Cover Graphic */}
      <div className="absolute top-0 right-0 w-2/3 h-full opacity-35 pointer-events-none select-none z-0 overflow-hidden">
        <motion.img 
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 0.35, scale: 1 }}
          transition={{ duration: 1.2 }}
          src="https://raw.githubusercontent.com/banyapon/banyapon.github.io/refs/heads/main/studio/images/player.png" 
          alt="Cyberpunk Fighter" 
          className="w-full h-full object-cover object-center grayscale hover:grayscale-0 transition-all duration-1000"
        />
      </div>

      {/* Grid overlay cover */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#050507] via-[#050507]/90 to-transparent z-0 pointer-events-none" />

      {/* Cyber screen scans overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.22)_50%)] bg-[length:100%_4px] pointer-events-none z-10 opacity-20" />

      {/* Navigation Header */}
      <header className="relative z-20 p-6 md:p-8 flex justify-between items-start border-b border-white/5 bg-[#050507]/60 backdrop-blur-md">
        <div className="flex items-start space-x-6">
          
          {/* Logo element with graceful error fallback */}
          <div className="relative">
            <motion.div 
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="flex items-center"
            >
              <img 
                src="https://raw.githubusercontent.com/banyapon/banyapon.github.io/refs/heads/main/studio/images/logo.png" 
                alt="Logo" 
                className="h-12 md:h-14 w-auto object-contain mr-4"
                onError={() => setLogoLoaded(false)}
              />
              
              {!logoLoaded && (
                <div className="border border-cyan-500/30 px-3 py-1.5 bg-cyan-500/10 rounded mr-4">
                  <span className="font-mono text-cyan-400 tracking-widest text-xs font-bold">NEON_LAUNCHER</span>
                </div>
              )}
            </motion.div>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] tracking-[0.4em] uppercase opacity-50 mb-1 font-mono">Tactical Dimension Matrix</span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter leading-none italic uppercase">
              NEON STRIKE<span className="text-orange-500">.</span>
            </h1>
            <p className="mt-1.5 text-[10px] md:text-xs tracking-widest opacity-40 max-w-xs uppercase leading-relaxed font-mono">
              3D Chamber &bull; Billboard mecha sprite &bull; Floor 50
            </p>
          </div>
        </div>

        {/* Right Info Badges */}
        <div className="hidden sm:flex items-center space-x-6 text-[10px] tracking-[0.2em] font-mono font-bold uppercase opacity-65">
          <div className="flex items-center space-x-2 text-cyan-400">
            <Wifi className="w-3.5 h-3.5" />
            <span>{latency} ms</span>
          </div>
          <div className="w-8 h-px bg-white/10"></div>
          <div className="flex items-center space-x-2 text-orange-400">
            <Thermometer className="w-3.5 h-3.5" />
            <span>{gpuTemp}°C</span>
          </div>
          <div className="w-8 h-px bg-white/10"></div>
          <span>v2.1.0-STABLE</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-20 flex-grow px-6 md:px-8 py-6 flex flex-col md:flex-row items-stretch justify-between gap-6 overflow-hidden">
        
        {/* Main interactive center deck */}
        <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
          
          <AnimatePresence mode="wait">
            
            {/* A. Landing lobby launcher */}
            {currentScreen === 'menu' && (
              <motion.div 
                key="launcher-deck"
                initial={{ opacity: 0, x: -25 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 25 }}
                transition={{ duration: 0.35 }}
                className="flex-grow flex flex-col justify-center max-w-xl space-y-6"
              >
                <div className="mb-4">
                  <div className="inline-flex items-center space-x-2 border border-orange-500/20 bg-orange-500/10 px-3 py-1 rounded text-[10px] font-mono uppercase tracking-widest text-orange-400 mb-4">
                    <Activity className="w-3.5 h-3.5 animate-pulse" />
                    <span>R3F Matrix Engine Activated</span>
                  </div>
                  <h2 className="text-3xl font-light uppercase tracking-wide text-white/90">
                    Entering the tactical chamber
                  </h2>
                  <p className="text-xs text-white/50 font-mono mt-2 leading-relaxed">
                    Test a fully integrated ThreeJS Fiber 3D sandbox. Walk a textured floor of scale 50. Calibrate your 8-directional layout with keybinding configurations.
                  </p>
                </div>

                {/* Vertical controller router list */}
                <nav className="flex flex-col space-y-2 select-none">
                  
                  {/* Join Area action */}
                  <button 
                    onClick={() => {
                      playSound('click', audioEnabled);
                      setCurrentScreen('game');
                      addLog('Deploying billboard player avatar to X:0, Z:0 coordinate plane...', 'system');
                    }}
                    className="group flex items-center space-x-4 text-left w-full border border-white/5 hover:border-cyan-500/40 bg-white/[0.01] hover:bg-cyan-500/5 p-4 rounded transition-all duration-300"
                  >
                    <span className="text-xs font-mono text-cyan-400 opacity-65 group-hover:opacity-100 transition-all">01</span>
                    <div className="flex-grow">
                      <span className="text-xl md:text-2xl font-light tracking-tight group-hover:italic uppercase group-hover:pl-2 transition-all">
                        Enter 3D Chamber
                      </span>
                      <p className="text-[10px] text-white/30 font-mono group-hover:text-cyan-400/50 transition-colors">Start live movement calibration tests</p>
                    </div>
                    <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 text-cyan-400 transition-all transform group-hover:translate-x-1" />
                  </button>

                  {/* Settings popup action */}
                  <button 
                    onClick={() => {
                      playSound('click', audioEnabled);
                      setShowOptionsDrawer(true);
                      addLog('Opened Virtual Input config bindings settings panel.', 'info');
                    }}
                    className="group flex items-center space-x-4 text-left w-full border border-white/5 hover:border-orange-500/40 bg-white/[0.01] hover:bg-orange-500/5 p-4 rounded transition-all duration-300"
                  >
                    <span className="text-xs font-mono text-orange-400 opacity-65 group-hover:opacity-100 transition-all">02</span>
                    <div className="flex-grow">
                      <span className="text-xl md:text-2xl font-light tracking-tight group-hover:italic uppercase group-hover:pl-2 transition-all">
                        Input Settings
                      </span>
                      <p className="text-[10px] text-white/30 font-mono group-hover:text-orange-400/50 transition-colors">Configure custom W-A-S-D tactile keys</p>
                    </div>
                    <Settings className="w-5 h-5 text-white/30 group-hover:text-orange-400 transition-colors" />
                  </button>

                  {/* Info system action */}
                  <button 
                    onClick={() => {
                      playSound('click', audioEnabled);
                      setCurrentScreen('credits');
                      addLog('Fetching system stack manifest logs...', 'info');
                    }}
                    className="group flex items-center space-x-4 text-left w-full border border-white/5 hover:border-white/20 bg-white/[0.01] hover:bg-white/5 p-4 rounded transition-all duration-300"
                  >
                    <span className="text-xs font-mono text-white/40 opacity-65 group-hover:opacity-100 transition-all">03</span>
                    <div className="flex-grow">
                      <span className="text-xl md:text-2xl font-light tracking-tight group-hover:italic uppercase group-hover:pl-2 transition-all">
                        System Credits
                      </span>
                      <p className="text-[10px] text-white/30 font-mono">Banyapon Studio credentials and structural specs</p>
                    </div>
                    <HelpCircle className="w-5 h-5 text-white/30" />
                  </button>

                </nav>
              </motion.div>
            )}

            {/* B. Live 3D Tactical Game Screen */}
            {currentScreen === 'game' && (
              <motion.div 
                key="arena-deck"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35 }}
                className="flex-grow flex flex-col justify-start h-full"
              >
                {/* HUD Header */}
                <div className="flex justify-between items-center bg-[#0d0d12]/95 border border-white/5 p-4 rounded-t-sm">
                  <div className="flex items-center space-x-5">
                    <button 
                      onClick={() => {
                        playSound('click', audioEnabled);
                        setCurrentScreen('menu');
                        addLog('Returned to tactical central deck lobby.', 'info');
                      }}
                      className="text-[10px] font-mono uppercase bg-white/10 hover:bg-white/20 text-white/80 px-3 py-1.5 rounded transition-colors"
                    >
                      &larr; Exit Field
                    </button>
                    
                    <div className="flex items-center space-x-2 font-mono text-[11px]">
                      <span className="opacity-40">VECTOR:</span>
                      <span className="text-cyan-400 font-bold tracking-widest">{currentDirection}</span>
                    </div>

                    <div className="flex items-center space-x-2 font-mono text-[11px]">
                      <span className="opacity-40">SCORE:</span>
                      <span className="text-orange-400 font-bold">{score}</span>
                    </div>

                    <div className="flex items-center space-x-2 border-l border-white/10 pl-4 font-mono text-[11px]">
                      <span className="opacity-40">LIVES:</span>
                      <div className="flex space-x-1 items-center">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <div 
                            key={idx} 
                            className={`w-2.5 h-4 border ${idx < playerHealth ? 'bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-transparent border-white/10'} rounded-sm transition-all duration-300`} 
                            title={`Health segment ${idx + 1}`}
                          />
                        ))}
                        <span className="text-red-400 font-bold ml-1.5">{playerHealth}/5</span>
                      </div>
                    </div>
                  </div>

                  {/* Ultimate charging status bar */}
                  <div className="flex items-center space-x-3">
                    <span className="text-[10px] font-mono opacity-50 uppercase">ULTIMATE:</span>
                    <div className="w-24 h-2.5 bg-white/10 rounded-full overflow-hidden border border-white/10 relative">
                      <div 
                        className={`h-full transition-all duration-100 ${ultimateCharge >= 100 ? 'bg-orange-500 animate-pulse' : 'bg-cyan-500'}`}
                        style={{ width: `${ultimateCharge}%` }}
                      />
                    </div>
                    {ultimateCharge >= 100 ? (
                      <span className="text-[9px] font-mono text-orange-400 font-black tracking-widest animate-pulse">READY! [Q]</span>
                    ) : (
                      <span className="text-[10px] font-mono text-white/40">{ultimateCharge}%</span>
                    )}
                  </div>
                </div>

                {/* 3D R3F Canvas Viewport */}
                <div className="relative bg-black border-x border-b border-white/5 rounded-b-sm h-[400px]">
                  
                  {/* Floating floating heads-up HUD guide */}
                  <div className="absolute top-4 left-4 z-10 bg-black/85 backdrop-blur-md p-4 border border-white/15 rounded font-mono text-[10px] text-white/80 max-w-[280px] space-y-1.5">
                    <div className="text-cyan-400 font-bold mb-1 uppercase tracking-widest flex items-center space-x-1.5">
                      <Compass className="w-3.5 h-3.5" />
                      <span>// CHIP CHAMBER MAP SPEC</span>
                    </div>
                    <div>&bull; GROUND SIZE: <span className="text-orange-400 font-bold">50 x 50 Textures</span></div>
                    <div>&bull; COORDS: <span className="text-cyan-400 font-bold">X:{playerCoords.x.toFixed(1)}, Z:{playerCoords.z.toFixed(1)}</span></div>
                    <div>&bull; MOVE (8 DIR): <kbd className="bg-white/15 px-1 rounded">{bindings.forward}</kbd> <kbd className="bg-white/15 px-1 rounded">{bindings.left}</kbd> <kbd className="bg-white/15 px-1 rounded">{bindings.back}</kbd> <kbd className="bg-white/15 px-1 rounded">{bindings.right}</kbd></div>
                    <div>&bull; DECRYPT TERMINAL: Move near obelisk & hold <kbd className="bg-white/15 px-1 rounded">{bindings.interact}</kbd></div>
                    <div className="text-[9px] text-white/40 mt-1 italic">&bull; Player billboard 2D auto-faces camera, shoots drones on sight.</div>
                  </div>

                  {/* Ultimate ready warning pop */}
                  {ultimateCharge >= 100 && (
                    <div className="absolute top-4 right-4 z-10 bg-orange-500/10 border border-orange-500 text-orange-400 p-2 rounded text-[10px] font-mono uppercase animate-pulse">
                      CRITICAL IMPACT READY: TAP [{bindings.ultimate}] TO DISCHARGE
                    </div>
                  )}

                  {/* Render R3F Canvas */}
                  <Canvas 
                    camera={{ position: [0, 8, 12], fov: 45 }}
                    shadows
                    className="w-full h-full"
                  >
                    <GameWorld />
                  </Canvas>

                  {/* Interactive hacking progress modal */}
                  {isHacking && (
                    <div className="absolute bottom-4 left-4 z-10 bg-cyan-950/90 border border-cyan-500 text-cyan-400 px-4 py-2 rounded font-mono text-[10px] flex items-center space-x-3 shadow-lg">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                      </span>
                      <span>DECRYPTING CENTRAL MEMORY GRID: {Math.round(terminalProgress)}%</span>
                    </div>
                  )}

                  {/* Reset action button */}
                  <button 
                    onClick={resetStats}
                    title="Reset Chamber Simulation"
                    className="absolute bottom-4 right-4 z-10 bg-black/80 hover:bg-white/10 border border-white/10 p-2.5 rounded text-white/60 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                </div>
              </motion.div>
            )}

            {/* C. System credentials */}
            {currentScreen === 'credits' && (
              <motion.div 
                key="credits-deck"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="flex-grow flex flex-col justify-center max-w-xl space-y-6 font-mono"
              >
                <div className="border-b border-white/10 pb-3">
                  <h2 className="text-2xl font-light uppercase tracking-widest text-cyan-400">Tactical Registry</h2>
                  <p className="text-[10px] text-white/40 mt-1">CREATIVE HARDWARE & TECHNOLOGY INTEGRATION</p>
                </div>

                <div className="space-y-4 text-xs leading-relaxed text-white/70 max-h-[250px] overflow-y-auto pr-2">
                  <div className="space-y-1">
                    <span className="text-[10px] text-orange-500 block font-bold uppercase tracking-widest">// STUDIO DEVELOPMENT LEADER</span>
                    <p className="text-white font-medium">Banyapon Studio & Creators</p>
                  </div>
                  
                  <div className="space-y-1">
                    <span className="text-[10px] text-orange-500 block font-bold uppercase tracking-widest">// COGNITIVE CO-PILOT stack</span>
                    <p className="text-white">Built and polished via Google Gemini Core & AI Studio Build Ecosystem</p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-orange-500 block font-bold uppercase tracking-widest">// LIBRARIES & RENDER TECHNOLOGY</span>
                    <p className="text-white text-[11px]">React 19, Three.js, React Three Fiber (@react-three/fiber), React Three Drei (@react-three/drei), Tailwind Utility Engine, Web Audio API Sound Synthesizer</p>
                  </div>

                  <p className="text-[10px] text-white/40 italic mt-6 pt-4 border-t border-white/5">
                    "All tactical components and key remappings compiled inside a sandboxed, containerized, high-octane workspace host."
                  </p>
                </div>

                <button 
                  onClick={() => {
                    playSound('click', audioEnabled);
                    setCurrentScreen('menu');
                  }}
                  className="inline-flex items-center space-x-2 text-xs font-mono uppercase bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded self-start transition-colors"
                >
                  &larr; Return to Central Deck
                </button>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Diagnostic System console logger at the bottom */}
          <div className="mt-6 border-t border-white/5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-[10px] font-bold">
                <TerminalIcon className="w-3.5 h-3.5" />
                <span className="tracking-widest uppercase">TACTICAL_MATRIX_STREAMS</span>
              </div>
              <span className="text-[9px] opacity-35 font-mono">LIVE CONNECTED</span>
            </div>

            <div className="bg-[#09090c] border border-white/5 p-3 rounded h-20 overflow-y-auto font-mono text-[10px] space-y-1 flex flex-col-reverse">
              {logs.map(log => (
                <div key={log.id} className="flex space-x-3 items-start">
                  <span className="opacity-25 text-[9px]">{log.timestamp}</span>
                  <span className={`
                    ${log.type === 'success' && 'text-green-400'}
                    ${log.type === 'danger' && 'text-red-400 font-bold'}
                    ${log.type === 'warning' && 'text-yellow-400'}
                    ${log.type === 'system' && 'text-cyan-400'}
                    ${log.type === 'info' && 'text-white/60'}
                  `}>
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Side: Control Bindings Remapping panel */}
        <aside className="w-full md:w-80 bg-white/[0.01] backdrop-blur-md p-6 border border-white/10 rounded flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-3">
              <div className="flex items-center space-x-2">
                <Keyboard className="w-4 h-4 text-orange-500" />
                <h3 className="text-xs tracking-[0.25em] uppercase font-mono font-bold text-orange-500">
                  Key Remapping
                </h3>
              </div>
              <span className="text-[9px] opacity-40 font-mono">INPUT V-CONF</span>
            </div>

            <p className="text-[10px] text-white/40 font-mono mb-4 leading-relaxed">
              Click any action button below, then press any key on your keyboard to instantly assign.
            </p>

            <div className="space-y-1.5">
              {[
                { label: 'Move Forward', key: 'forward' as keyof KeyBindings },
                { label: 'Move Left', key: 'left' as keyof KeyBindings },
                { label: 'Move Back', key: 'back' as keyof KeyBindings },
                { label: 'Move Right', key: 'right' as keyof KeyBindings },
                { label: 'Decrypt Terminal', key: 'interact' as keyof KeyBindings },
                { label: 'Ultimate Strike', key: 'ultimate' as keyof KeyBindings },
              ].map((item) => {
                const active = remappingKey === item.key;
                return (
                  <div 
                    key={item.key}
                    className={`flex justify-between items-center p-2 rounded transition-all border ${active ? 'border-orange-500/50 bg-orange-500/10' : 'border-transparent hover:bg-white/[0.01]'}`}
                  >
                    <span className="text-xs text-white/70 uppercase font-mono">{item.label}</span>
                    <button
                      onClick={() => {
                        playSound('click', audioEnabled);
                        setRemappingKey(item.key);
                        addLog(`Press a key to remap: [${item.label}]`, 'warning');
                      }}
                      className={`min-w-16 px-3 py-1.5 rounded text-[10px] font-mono uppercase font-bold transition-all ${active ? 'bg-orange-500 text-black animate-pulse' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    >
                      {active ? 'PRESS KEY...' : bindings[item.key]}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 p-4 bg-orange-500/5 border border-orange-500/20 rounded">
              <div className="flex items-start space-x-2">
                <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-orange-300 font-mono uppercase leading-normal">
                  Warning: Custom keys should not overlap. Conflicts will trigger a denied alert beeper warning.
                </p>
              </div>
            </div>

            {/* Custom Item Asset Config */}
            <div className="mt-5 border-t border-white/5 pt-4 space-y-2">
              <span className="text-[10px] tracking-[0.2em] uppercase font-mono font-bold text-cyan-400 block">
                Item Sprite (Cloudinary)
              </span>
              <p className="text-[9px] text-white/40 font-mono leading-relaxed">
                Paste any 256x256px Cloudinary or secure image URL below to override the in-game powerup sprite.
              </p>
              <input 
                type="text"
                value={itemUrl}
                onChange={(e) => {
                  setItemUrl(e.target.value);
                }}
                placeholder="https://res.cloudinary.com/..."
                className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-[10px] font-mono text-white/90 placeholder-white/20 focus:border-cyan-500/50 focus:outline-none transition-colors"
              />
              <div className="flex justify-between items-center text-[8px] font-mono uppercase">
                <span className={itemLoaded ? "text-green-400 font-bold" : "text-yellow-400 font-bold"}>
                  STATUS: {itemLoaded ? "ONLINE" : "FALLBACK"}
                </span>
                <button 
                  onClick={() => {
                    setItemUrl('https://raw.githubusercontent.com/banyapon/banyapon.github.io/refs/heads/main/studio/images/item.png');
                    playSound('click', audioEnabled);
                  }}
                  className="text-white/40 hover:text-white transition-colors"
                >
                  [ RESET DEFAULT ]
                </button>
              </div>
            </div>

          </div>

          {/* Sound FX settings */}
          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-[10px] text-white/40 font-mono">System Sound FX:</span>
            <button 
              onClick={() => {
                const nextState = !audioEnabled;
                setAudioEnabled(nextState);
                if (nextState) {
                  playSound('click', true);
                }
              }}
              className={`flex items-center space-x-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded transition-all border ${audioEnabled ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/5' : 'border-white/10 text-white/40 bg-white/5'}`}
            >
              {audioEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>SYNTH ACTIVE</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>MUTED</span>
                </>
              )}
            </button>
          </div>

        </aside>

      </main>

       {/* Full screen modal popup when remapping trigger is locked in */}
      <AnimatePresence>
        {remappingKey && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#050507]/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-black/95 border border-orange-500/40 p-8 rounded-sm max-w-sm w-full text-center space-y-4 shadow-2xl relative"
            >
              <div className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto mb-2 text-orange-500">
                <Keyboard className="w-6 h-6 animate-pulse" />
              </div>

              <h4 className="text-sm font-mono tracking-widest uppercase text-orange-500 font-bold">REMAP BINDING MODE</h4>
              <p className="text-xs text-white/60 font-mono leading-relaxed uppercase">
                Awaiting input to re-bind action <span className="text-white font-bold">[{remappingKey.toUpperCase()}]</span>. Press any key on your mechanical keyboard to map.
              </p>
              
              <div className="text-[10px] text-white/30 font-mono uppercase italic pt-2">
                Press [ESC] key to cancel remapping.
              </div>
            </motion.div>
          </motion.div>
        )}

        {gameOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#050507]/95 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 20 }}
              className="bg-black/95 border-2 border-red-500/50 p-8 md:p-10 rounded-sm max-w-sm w-full text-center space-y-6 shadow-[0_0_50px_rgba(239,68,68,0.25)] relative"
            >
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-500">
                <ShieldAlert className="w-8 h-8 animate-pulse" />
              </div>

              <div className="space-y-2">
                <h3 className="text-3xl font-black tracking-tighter uppercase text-red-500 italic">
                  GAME OVER
                </h3>
                <p className="text-[10px] tracking-[0.3em] font-mono text-white/40 uppercase">
                  neural link collapsed
                </p>
              </div>

              <div className="bg-[#0c0c10] border border-white/5 p-4 rounded font-mono text-xs text-left space-y-2 text-white/70">
                <div className="flex justify-between">
                  <span className="opacity-40">CHIP COORDS:</span>
                  <span className="text-cyan-400 font-bold">X:{playerCoords.x.toFixed(1)} Z:{playerCoords.z.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-40">DECRYPTED DATA:</span>
                  <span className="text-green-400 font-bold">{Math.round(terminalProgress)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-40">TACTICAL SCORE:</span>
                  <span className="text-orange-400 font-bold">{score} PTS</span>
                </div>
              </div>

              <p className="text-xs text-white/60 font-mono uppercase leading-relaxed">
                Your tactical link with the biomecha avatar collapsed after 5 drone collisions. Re-stabilize connection to reboot.
              </p>

              <div className="pt-2 flex flex-col space-y-2">
                <button
                  onClick={() => {
                    resetStats();
                  }}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-sm text-xs font-mono uppercase tracking-widest shadow-[0_0_15px_rgba(239,68,68,0.4)] hover:shadow-[0_0_25px_rgba(239,68,68,0.6)] transition-all duration-300"
                >
                  Reboot Simulator
                </button>
                <button
                  onClick={() => {
                    resetStats();
                    setCurrentScreen('menu');
                  }}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 py-2 rounded text-[10px] font-mono uppercase tracking-widest transition-colors"
                >
                  Return to Main Menu
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Footer */}
      <footer className="relative z-20 px-6 md:px-8 py-4 border-t border-white/5 flex justify-between items-center bg-[#050507]/80">
        <div className="flex space-x-8">
          <div className="flex flex-col">
            <span className="text-[9px] opacity-35 uppercase tracking-widest font-mono">LATENCY</span>
            <span className="text-[11px] font-mono text-cyan-400 font-bold">{latency} MS</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] opacity-35 uppercase tracking-widest font-mono">GPU LOAD</span>
            <span className="text-[11px] font-mono text-orange-400 font-bold">{gpuTemp}°C</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] opacity-35 uppercase tracking-widest font-mono">FPS</span>
            <span className="text-[11px] font-mono text-green-400 font-bold">{fps}</span>
          </div>
        </div>
        <div className="text-[9px] opacity-30 uppercase tracking-[0.4em] font-mono">
          &copy; 2026 BANYAPON STUDIO. ALL RIGHTS RESERVED.
        </div>
      </footer>

    </div>
  );
}
