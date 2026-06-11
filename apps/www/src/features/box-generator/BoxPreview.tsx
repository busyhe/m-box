import { useEffect, useMemo, useRef } from 'react'
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { BufferGeometry } from 'three'
import type { MeshData } from './types'
import { meshToBufferGeometry } from './geometry'

type BoxPreviewProps = {
  mesh: MeshData
  modelGeometry?: BufferGeometry
  showModel: boolean
}

export function BoxPreview({ mesh, modelGeometry, showModel }: BoxPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const boxGeometry = useMemo(() => meshToBufferGeometry(mesh), [mesh])

  useEffect(() => () => boxGeometry.dispose(), [boxGeometry])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new Scene()

    const renderer = new WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearAlpha(0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.background = 'transparent'
    renderer.domElement.style.border = '0'
    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.style.touchAction = 'pan-y'
    container.append(renderer.domElement)

    const camera = new OrthographicCamera(-80, 80, 60, -60, 0.1, 1000)
    camera.up.set(0, 0, 1)
    camera.position.set(105, -120, 86)
    camera.lookAt(0, 0, 16)

    const group = new Group()
    scene.add(group)

    const boxMaterial = new MeshStandardMaterial({
      color: '#e8e3d6',
      metalness: 0.05,
      roughness: 0.72,
      transparent: true,
      opacity: 0.97,
    })
    const boxMesh = new Mesh(boxGeometry, boxMaterial)
    group.add(boxMesh)

    const edgeMaterial = new LineBasicMaterial({ color: '#50606a', transparent: true, opacity: 0.55 })
    const edges = new LineSegments(new EdgesGeometry(boxGeometry, 24), edgeMaterial)
    group.add(edges)

    let uploadedMesh: Mesh | undefined
    if (modelGeometry && showModel) {
      const modelMaterial = new MeshStandardMaterial({
        color: '#2f8f83',
        metalness: 0.08,
        roughness: 0.52,
        transparent: true,
        opacity: 0.32,
      })
      uploadedMesh = new Mesh(modelGeometry, modelMaterial)
      group.add(uploadedMesh)
    }

    const ambient = new AmbientLight('#ffffff', 1.8)
    const key = new DirectionalLight('#ffffff', 2.6)
    key.position.set(80, -80, 120)
    const fill = new DirectionalLight('#dceeff', 1.2)
    fill.position.set(-90, 80, 60)
    scene.add(ambient, key, fill)

    fitCamera(camera, boxGeometry, container.clientWidth, container.clientHeight)

    let frame = 0
    let dragging = false
    let dragStartX = 0
    let dragStartY = 0
    let dragStartPitch = 0
    let currentYaw = 0
    let targetYaw = 0
    let currentPitch = 0
    let targetPitch = 0
    let viewStep = 0
    const yawStep = Math.PI / 2
    const dragThreshold = 44
    const pitchSensitivity = 0.008
    const minPitch = -Math.PI / 3
    const maxPitch = Math.PI / 3
    const setViewStep = (nextStep: number) => {
      viewStep = wrapViewStep(nextStep)
      targetYaw = viewStep * yawStep
      container.dataset.viewStep = String(viewStep)
    }
    setViewStep(0)
    group.rotation.x = 0
    group.rotation.z = 0

    const render = () => {
      currentYaw += shortestAngleDelta(currentYaw, targetYaw) * 0.16
      if (Math.abs(shortestAngleDelta(currentYaw, targetYaw)) < 0.001) {
        currentYaw = targetYaw
      }
      currentPitch += (targetPitch - currentPitch) * 0.24
      if (Math.abs(currentPitch - targetPitch) < 0.001) {
        currentPitch = targetPitch
      }
      group.rotation.x = currentPitch
      group.rotation.z = currentYaw
      renderer.render(scene, camera)
      frame = window.requestAnimationFrame(render)
    }
    render()

    const onPointerDown = (event: PointerEvent) => {
      dragging = true
      dragStartX = event.clientX
      dragStartY = event.clientY
      dragStartPitch = targetPitch
      renderer.domElement.style.cursor = 'grabbing'
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return
      }
      const dx = event.clientX - dragStartX
      const dy = event.clientY - dragStartY
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        event.preventDefault()
      }
      targetPitch = clamp(dragStartPitch + dy * pitchSensitivity, minPitch, maxPitch)
    }
    const onPointerUp = (event: PointerEvent) => {
      const dx = event.clientX - dragStartX
      const dy = event.clientY - dragStartY
      dragging = false
      renderer.domElement.style.cursor = 'grab'
      if (Math.abs(dx) >= dragThreshold && Math.abs(dx) > Math.abs(dy)) {
        setViewStep(viewStep + (dx > 0 ? 1 : -1))
      }
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId)
      }
    }
    const onDoubleClick = () => {
      setViewStep(0)
      targetPitch = 0
    }
    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight)
      fitCamera(camera, boxGeometry, container.clientWidth, container.clientHeight)
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(container)

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('dblclick', onDoubleClick)
    window.addEventListener('resize', onResize)

    return () => {
      window.cancelAnimationFrame(frame)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('dblclick', onDoubleClick)
      window.removeEventListener('resize', onResize)
      resizeObserver.disconnect()
      boxMaterial.dispose()
      edgeMaterial.dispose()
      edges.geometry.dispose()
      if (uploadedMesh) {
        const material = uploadedMesh.material
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose())
        } else {
          material.dispose()
        }
      }
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [boxGeometry, modelGeometry, showModel])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      aria-label="3D preview of the generated storage box"
    />
  )
}

function fitCamera(
  camera: OrthographicCamera | PerspectiveCamera,
  geometry: BufferGeometry,
  width: number,
  height: number,
) {
  if (!(camera instanceof OrthographicCamera)) {
    return
  }

  geometry.computeBoundingBox()
  const box = geometry.boundingBox ?? new Box3()
  const size = new Vector3()
  box.getSize(size)
  const maxDimension = Math.max(size.x, size.y, size.z, 60)
  const aspect = width > 0 && height > 0 ? width / height : 1
  const zoom = maxDimension * 0.95
  camera.left = -zoom * aspect
  camera.right = zoom * aspect
  camera.top = zoom
  camera.bottom = -zoom
  camera.near = 0.1
  camera.far = 1000
  camera.updateProjectionMatrix()
}

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function wrapViewStep(step: number) {
  return ((step % 4) + 4) % 4
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
