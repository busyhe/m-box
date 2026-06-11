import { useEffect, useMemo, useRef } from 'react'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { BufferGeometry } from 'three'
import type { MeshData } from './types'
import { meshToBufferGeometry } from './geometry'

type BoxPreviewProps = {
  mesh: MeshData
  modelGeometry?: BufferGeometry
  showModel: boolean
}

type Viewer = {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  controls: OrbitControls
  content: Group
  grid: GridHelper
  hasFitted: boolean
  /** 上次取景时的包围球半径,用于判断内容尺寸是否发生显著变化 */
  lastFitRadius?: number
  /** 双击重置视角的过渡动画状态 */
  animation?: CameraAnimation
}

type CameraAnimation = {
  start: number
  duration: number
  fromTarget: Vector3
  toTarget: Vector3
  fromDir: Vector3
  rotation: Quaternion
  fromLen: number
  toLen: number
}

const IDENTITY_QUATERNION = new Quaternion()

export function BoxPreview({ mesh, modelGeometry, showModel }: BoxPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const boxGeometry = useMemo(() => meshToBufferGeometry(mesh), [mesh])

  useEffect(() => () => boxGeometry.dispose(), [boxGeometry])

  // 一次性初始化：渲染器 / 相机 / 轨道控制器 / 灯光
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
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.background = 'transparent'
    renderer.domElement.style.border = '0'
    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.style.touchAction = 'none'
    container.append(renderer.domElement)

    const camera = new PerspectiveCamera(
      40,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      4000,
    )
    camera.up.set(0, 0, 1)
    camera.position.set(140, -160, 110)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.9
    controls.enablePan = true
    controls.panSpeed = 0.8
    controls.zoomSpeed = 0.9
    controls.minDistance = 20
    controls.maxDistance = 1500
    // 限制俯仰避免穿到地面以下太多，水平方向可 360° 自由旋转
    controls.minPolarAngle = 0.05
    controls.maxPolarAngle = Math.PI - 0.35

    const content = new Group()
    scene.add(content)

    const grid = new GridHelper(400, 40, 0x8895a0, 0x8895a0)
    grid.rotation.x = Math.PI / 2
    const gridMaterial = grid.material as LineBasicMaterial
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.14
    scene.add(grid)

    const hemisphere = new HemisphereLight('#ffffff', '#cfd8de', 0.9)
    const ambient = new AmbientLight('#ffffff', 0.5)
    const key = new DirectionalLight('#ffffff', 2.2)
    key.position.set(120, -100, 160)
    const fill = new DirectionalLight('#dceeff', 0.9)
    fill.position.set(-110, 90, 70)
    const rim = new DirectionalLight('#ffffff', 0.6)
    rim.position.set(0, 140, -60)
    scene.add(hemisphere, ambient, key, fill, rim)

    const viewer: Viewer = { renderer, scene, camera, controls, content, grid, hasFitted: false }
    viewerRef.current = viewer

    let frame = 0
    const render = () => {
      const animation = viewer.animation
      if (animation) {
        const t = Math.min(1, (performance.now() - animation.start) / animation.duration)
        const eased = easeInOutCubic(t)
        const q = new Quaternion().slerpQuaternions(IDENTITY_QUATERNION, animation.rotation, eased)
        const dir = animation.fromDir.clone().applyQuaternion(q)
        const len = animation.fromLen + (animation.toLen - animation.fromLen) * eased
        controls.target.lerpVectors(animation.fromTarget, animation.toTarget, eased)
        camera.position.copy(controls.target).addScaledVector(dir, len)
        if (t >= 1) {
          viewer.animation = undefined
          controls.enabled = true
        }
      }
      controls.update()
      renderer.render(scene, camera)
      frame = window.requestAnimationFrame(render)
    }
    render()

    const onPointerDown = () => {
      renderer.domElement.style.cursor = 'grabbing'
    }
    const onPointerUp = () => {
      renderer.domElement.style.cursor = 'grab'
    }
    const onDoubleClick = () => {
      startResetAnimation(viewer)
    }
    const onResize = () => {
      const width = container.clientWidth
      const height = Math.max(container.clientHeight, 1)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(container)

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('dblclick', onDoubleClick)
    window.addEventListener('resize', onResize)

    return () => {
      window.cancelAnimationFrame(frame)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('dblclick', onDoubleClick)
      window.removeEventListener('resize', onResize)
      resizeObserver.disconnect()
      controls.dispose()
      grid.geometry.dispose()
      gridMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      viewerRef.current = null
    }
  }, [])

  // 几何更新：只替换网格，不重建渲染器，保留当前视角
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) {
      return
    }

    const hasModel = Boolean(modelGeometry && showModel)
    const { content } = viewer

    const boxMaterial = new MeshStandardMaterial({
      color: '#e8e3d6',
      metalness: 0.05,
      roughness: 0.62,
      transparent: true,
      // 有内置模型时盒体半透明，便于观察模型摆放
      opacity: hasModel ? 0.42 : 0.97,
      depthWrite: !hasModel,
    })
    const boxMesh = new Mesh(boxGeometry, boxMaterial)
    boxMesh.renderOrder = 2
    content.add(boxMesh)

    const edgeMaterial = new LineBasicMaterial({
      color: '#50606a',
      transparent: true,
      opacity: hasModel ? 0.4 : 0.55,
    })
    const edges = new LineSegments(new EdgesGeometry(boxGeometry, 24), edgeMaterial)
    content.add(edges)

    let uploadedMesh: Mesh | undefined
    if (modelGeometry && showModel) {
      // 半透明模型预览,先于盒体渲染以便透过盒壁观察
      const modelMaterial = new MeshStandardMaterial({
        color: '#1c9c8d',
        metalness: 0.1,
        roughness: 0.45,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
      uploadedMesh = new Mesh(modelGeometry, modelMaterial)
      uploadedMesh.renderOrder = 1
      content.add(uploadedMesh)
    }

    fitView(viewer, !viewer.hasFitted)
    viewer.hasFitted = true

    return () => {
      content.remove(boxMesh, edges)
      boxMaterial.dispose()
      edgeMaterial.dispose()
      edges.geometry.dispose()
      if (uploadedMesh) {
        content.remove(uploadedMesh)
        const material = uploadedMesh.material
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose())
        } else {
          material.dispose()
        }
      }
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

function fitView(viewer: Viewer, resetOrientation: boolean) {
  const { camera, controls, content, grid } = viewer

  // 取消进行中的视角动画,避免与取景计算冲突
  viewer.animation = undefined
  controls.enabled = true

  const bounds = new Box3().setFromObject(content)
  if (bounds.isEmpty()) {
    return
  }

  const sphere = new Sphere()
  bounds.getBoundingSphere(sphere)
  const radius = Math.max(sphere.radius, 30)

  const size = new Vector3()
  bounds.getSize(size)
  const gridSize = Math.max(size.x, size.y) * 3
  grid.scale.setScalar(gridSize / 400)

  controls.target.copy(sphere.center)
  controls.minDistance = radius * 0.5
  controls.maxDistance = radius * 8

  const fov = (camera.fov * Math.PI) / 180
  const distance = (radius / Math.sin(fov / 2)) * 1.1

  // 内容尺寸变化超过 25%(如上传模型后自动适配)时,重新缩放到合适取景
  const sizeChangedSignificantly =
    viewer.lastFitRadius === undefined ||
    Math.abs(radius - viewer.lastFitRadius) / viewer.lastFitRadius > 0.25

  if (resetOrientation) {
    const direction = new Vector3(0.72, -0.82, 0.58).normalize()
    camera.position.copy(sphere.center).addScaledVector(direction, distance)
    viewer.lastFitRadius = radius
  } else {
    const direction = camera.position.clone().sub(controls.target)
    if (direction.lengthSq() === 0) {
      direction.set(0.72, -0.82, 0.58)
    }
    const nextDistance = sizeChangedSignificantly
      ? distance
      : clamp(direction.length(), controls.minDistance, controls.maxDistance)
    camera.position.copy(controls.target).addScaledVector(direction.normalize(), nextDistance)
    if (sizeChangedSignificantly) {
      viewer.lastFitRadius = radius
    }
  }

  camera.near = Math.max(radius / 100, 0.1)
  camera.far = radius * 40
  camera.updateProjectionMatrix()
  controls.update()
}

/** 双击重置:以缓动动画过渡到默认视角,而非瞬间跳转 */
function startResetAnimation(viewer: Viewer) {
  const { camera, controls, content } = viewer

  const bounds = new Box3().setFromObject(content)
  if (bounds.isEmpty()) {
    return
  }

  const sphere = new Sphere()
  bounds.getBoundingSphere(sphere)
  const radius = Math.max(sphere.radius, 30)
  const fov = (camera.fov * Math.PI) / 180
  const distance = (radius / Math.sin(fov / 2)) * 1.1
  const toDir = new Vector3(0.72, -0.82, 0.58).normalize()

  const fromTarget = controls.target.clone()
  const toTarget = sphere.center.clone()
  const fromOffset = camera.position.clone().sub(fromTarget)
  const fromLen = fromOffset.length() || distance
  const fromDir = fromOffset.lengthSq() > 0 ? fromOffset.normalize() : toDir.clone()

  viewer.animation = {
    start: performance.now(),
    duration: 600,
    fromTarget,
    toTarget,
    fromDir,
    rotation: new Quaternion().setFromUnitVectors(fromDir, toDir),
    fromLen,
    toLen: distance,
  }
  viewer.lastFitRadius = radius
  // 动画期间锁定交互,避免拖拽与动画互相干扰
  controls.enabled = false
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
