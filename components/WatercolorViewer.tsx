'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer, EffectPass, RenderPass } from 'postprocessing'
import { KuwaharaEffectImpl } from '@/lib/shaders/KuwaharaEffect'
import { OutlineEffectImpl } from '@/lib/shaders/OutlineEffect'
import { BoilingEffectImpl } from '@/lib/shaders/BoilingEffect'
import { PaperOverlayEffectImpl } from '@/lib/shaders/PaperOverlayEffect'

interface WatercolorSettings {
  kuwahara: boolean
  outline:  boolean
  boiling:  boolean
  paper:    boolean
}

const EFFECTS: { key: keyof WatercolorSettings; label: string }[] = [
  { key: 'kuwahara', label: 'Peinture' },
  { key: 'outline',  label: 'Contours' },
  { key: 'boiling',  label: 'Vibration' },
  { key: 'paper',    label: 'Papier' },
]

export default function WatercolorViewer({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [settings, setSettings] = useState<WatercolorSettings>({
    kuwahara: true,
    outline:  true,
    boiling:  true,
    paper:    true,
  })

  const toggle = (key: keyof WatercolorSettings) =>
    setSettings((s) => ({ ...s, [key]: !s[key] }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width  = canvas.clientWidth  || 800
    const height = canvas.clientHeight || 500

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(width, height, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // ── Scene + camera ──
    const scene  = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f0e8)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000)
    camera.position.set(0, 1, 3)

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 10, 5)
    scene.add(dir)

    // ── OrbitControls ──
    const controls = new OrbitControls(camera, canvas)
    controls.autoRotate      = true
    controls.autoRotateSpeed = 0.5
    controls.enableDamping   = true

    // ── Charger le modèle ──
    const loader = new GLTFLoader()
    loader.load(src, (gltf) => {
      const box    = new THREE.Box3().setFromObject(gltf.scene)
      const center = box.getCenter(new THREE.Vector3())
      const size   = box.getSize(new THREE.Vector3()).length()
      gltf.scene.position.sub(center)
      camera.position.set(0, size * 0.2, size * 1.2)
      controls.update()
      scene.add(gltf.scene)
    })

    // ── Post-processing ──
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))

    const effects = []
    if (settings.kuwahara) effects.push(new KuwaharaEffectImpl({ radius: 2 }))
    if (settings.outline)  effects.push(new OutlineEffectImpl({ edgeStrength: 3.0, edgeColor: '#2d1a0e', noiseFrequency: 8.0 }))
    if (settings.boiling)  effects.push(new BoilingEffectImpl({ speed: 1.0, strength: 0.002 }))
    if (settings.paper)    effects.push(new PaperOverlayEffectImpl({ opacity: 0.15 }))
    if (effects.length > 0) composer.addPass(new EffectPass(camera, ...effects))

    // ── Boucle d'animation ──
    const clock = new THREE.Clock()
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      controls.update()
      composer.render(clock.getDelta())
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      controls.dispose()
      composer.dispose()
      renderer.dispose()
    }
  }, [src, settings])

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '60vh', display: 'block' }}
      />
      {/* Toggles watercolor */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        {EFFECTS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition
              ${settings[key]
                ? 'bg-brand-500 text-white border-brand-600'
                : 'bg-white/80 text-gray-500 border-surface-border'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
