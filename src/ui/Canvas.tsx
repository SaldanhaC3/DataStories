/**
 * Área de desenho.
 *
 * A cena vem pronta do núcleo; aqui ela vira JSX e ganha interação direta:
 * clicar numa marca destaca a série (ou a categoria, nos gráficos de
 * composição) e arrastar uma anotação a reposiciona. Editar direto no gráfico
 * é mais rápido do que caçar o controle equivalente no painel, e é o que se
 * espera de uma ferramenta de acabamento.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ChartSpec, Scene, SceneNode } from '../core/types'
import { getChartDefinition } from '../core/render'
import { formatNumber } from '../core/format'
import { useEditor } from '../state/store'

interface HoverState {
  x: number
  y: number
  series: string
  category: string
  value: number
  /** Chave usada para esmaecer as marcas que não são a hovered. */
  key: string
  /** Posição do cursor em unidades do SVG, para o crosshair. */
  svgX: number
}

/**
 * A chave de hover desce até cada marca via contexto: é o que permite
 * esmaecer as séries concorrentes sem repassar props pela árvore inteira.
 */
const HoverContext = createContext<{
  key: string | null
  highlightsCategories: boolean
}>({ key: null, highlightsCategories: false })

interface NodeProps {
  node: SceneNode
  index: number
}

type SvgBaseline = 'central' | 'hanging' | undefined

function baselineOf(baseline: string | undefined): SvgBaseline {
  if (baseline === 'middle') return 'central'
  if (baseline === 'hanging') return 'hanging'
  return undefined
}

function SceneNodeView({ node, index }: NodeProps) {
  const hover = useContext(HoverContext)

  let className = node.meta ? 'mark-clickable' : undefined
  if (node.meta) {
    const key = hover.highlightsCategories ? node.meta.category : node.meta.series
    if (hover.key != null && key !== hover.key) className = 'mark-clickable mark-dim'
    else if (hover.key != null) className = 'mark-clickable mark-hot'
  } else if (node.handle?.startsWith('annotation:')) {
    className = 'draggable-annotation'
  }

  const markStyle = node.meta
    ? { animationDelay: `${Math.min(index * 18, 360)}ms` }
    : undefined

  const common = {
    opacity: node.opacity,
    'data-handle': node.handle,
    'data-series': node.meta?.series,
    'data-row': node.meta?.rowIndex,
    'data-category': node.meta?.category,
    'data-value': node.meta?.value,
    className,
  }

  switch (node.t) {
    case 'rect':
      return (
        <rect
          key={index}
          x={node.x}
          y={node.y}
          width={Math.max(0, node.w)}
          height={Math.max(0, node.h)}
          rx={node.rx}
          fill={node.fill}
          stroke={node.stroke}
          strokeWidth={node.strokeWidth}
          style={markStyle}
          {...common}
        />
      )
    case 'line':
      return (
        <line
          key={index}
          x1={node.x1}
          y1={node.y1}
          x2={node.x2}
          y2={node.y2}
          stroke={node.stroke}
          strokeWidth={node.strokeWidth ?? 1}
          strokeDasharray={node.dash}
          strokeLinecap={node.linecap}
          style={markStyle}
          {...common}
        />
      )
    case 'circle':
      return (
        <circle
          key={index}
          cx={node.cx}
          cy={node.cy}
          r={Math.max(0, node.r)}
          fill={node.fill}
          stroke={node.stroke}
          strokeWidth={node.strokeWidth}
          style={markStyle}
          {...common}
        />
      )
    case 'path':
      return (
        <path
          key={index}
          d={node.d}
          fill={node.fill ?? 'none'}
          stroke={node.stroke}
          strokeWidth={node.strokeWidth}
          strokeDasharray={node.dash}
          strokeLinecap={node.linecap}
          strokeLinejoin={node.linejoin}
          style={markStyle}
          {...common}
        />
      )
    case 'text':
      return (
        <text
          key={index}
          x={node.x}
          y={node.y}
          fill={node.fill}
          fontSize={node.size}
          fontWeight={node.weight}
          fontFamily={node.family}
          textAnchor={node.anchor}
          dominantBaseline={baselineOf(node.baseline)}
          letterSpacing={node.letterSpacing}
          stroke={node.halo}
          strokeWidth={node.halo ? node.haloWidth ?? 3 : undefined}
          strokeLinejoin={node.halo ? 'round' : undefined}
          paintOrder={node.halo ? 'stroke' : undefined}
          style={{ userSelect: 'none', ...markStyle }}
          {...common}
        >
          {node.text}
        </text>
      )
    case 'g':
      return (
        <g key={index} transform={node.transform} opacity={node.opacity}>
          {node.children.map((child, i) => (
            <SceneNodeView key={i} node={child} index={i} />
          ))}
        </g>
      )
  }
}

interface CanvasProps {
  scene: Scene
  spec: ChartSpec
  /** Habilita clique e arrasto. Desligado no preview de exportação. */
  interactive?: boolean
}

interface DragState {
  id: string
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  moved: boolean
}

export function Canvas({ scene, spec, interactive = true }: CanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const update = useEditor((s) => s.update)
  const selectAnnotation = useEditor((s) => s.selectAnnotation)
  const setStep = useEditor((s) => s.setStep)

  const definition = useMemo(() => getChartDefinition(spec.chart.type), [spec.chart.type])
  /**
   * Com uma serie so, "destacar" quer dizer acender uma barra — ou seja, uma
   * categoria. Com varias, quer dizer acender uma linha inteira. A regra segue
   * o que o clique significa para quem esta olhando, nao a estrutura interna.
   */
  const highlightsCategories =
    definition.bare || spec.chart.type === 'slope' || scene.series.length <= 1

  /** Converte pixels de tela em unidades do SVG. */
  const scaleOf = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 1
    return scene.width / rect.width
  }, [scene.width])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!interactive) return
      const target = event.target as Element
      const handle = target.getAttribute('data-handle')
      if (!handle?.startsWith('annotation:')) return

      const id = handle.slice('annotation:'.length)
      const annotation = spec.annotations.find((a) => a.id === id)
      if (!annotation || annotation.kind !== 'text') return

      event.preventDefault()
      // A captura de ponteiro faz o arrasto continuar valendo quando o cursor
      // sai do SVG. Nao e essencial: se o navegador recusar, o arrasto ainda
      // funciona dentro do quadro, e derrubar o handler custaria bem mais.
      try {
        svgRef.current?.setPointerCapture(event.pointerId)
      } catch {
        // sem captura, seguimos com o arrasto simples
      }
      selectAnnotation(id)
      setDrag({
        id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: annotation.x,
        originY: annotation.y,
        moved: false,
      })
    },
    [interactive, spec.annotations, selectAnnotation],
  )

  /**
   * Nas linhas, quem recebe o hover é o caminho inteiro (valor NaN no rastro).
   * O número certo é o da marca da mesma série mais próxima do cursor — este
   * método o acha entre os nós já desenhados, sem recalcular nada do modelo.
   */
  const nearestDatum = useCallback(
    (series: string, svgX: number): { category: string; value: number } | null => {
      const svg = svgRef.current
      if (!svg) return null
      const svgRect = svg.getBoundingClientRect()
      const scale = svgRect.width > 0 ? scene.width / svgRect.width : 1
      let best: { category: string; value: number; dist: number } | null = null
      for (const el of svg.querySelectorAll<SVGElement>('[data-series]')) {
        if (el.getAttribute('data-series') !== series) continue
        const value = Number(el.getAttribute('data-value'))
        if (!Number.isFinite(value)) continue
        const box = el.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) continue
        const cx = (box.left + box.width / 2 - svgRect.left) * scale
        const dist = Math.abs(cx - svgX)
        if (!best || dist < best.dist) {
          best = { category: el.getAttribute('data-category') ?? '', value, dist }
        }
      }
      return best ? { category: best.category, value: best.value } : null
    },
    [scene.width],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Tooltip: qualquer marca com rastro mostra série, categoria e valor.
      if (interactive && !drag) {
        const target = event.target as Element
        const series = target.getAttribute('data-series')
        const shell = svgRef.current?.parentElement
        if (series != null && shell) {
          const svgRect = svgRef.current?.getBoundingClientRect()
          const scale = svgRect && svgRect.width > 0 ? scene.width / svgRect.width : 1
          const svgX = svgRect ? (event.clientX - svgRect.left) * scale : 0
          const value = Number(target.getAttribute('data-value'))
          const rect = shell.getBoundingClientRect()
          const category = target.getAttribute('data-category') ?? ''
          const nearest = Number.isFinite(value) ? null : nearestDatum(series, svgX)
          setHover({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            series,
            category: nearest?.category ?? category,
            value: Number.isFinite(value) ? value : (nearest?.value ?? Number.NaN),
            key: highlightsCategories ? category : series,
            svgX,
          })
        } else if (hover) {
          setHover(null)
        }
      }

      if (!drag || event.pointerId !== drag.pointerId) return
      const scale = scaleOf()
      const dx = ((event.clientX - drag.startClientX) * scale) / scene.plot.width
      const dy = ((event.clientY - drag.startClientY) * scale) / scene.plot.height
      if (!drag.moved && Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002) return

      setDrag({ ...drag, moved: true })
      // A mesma chave de fusão em todo o arrasto: um Ctrl+Z desfaz o movimento
      // inteiro, não cada pixel.
      update(
        (draft) => {
          const annotation = draft.annotations.find((a) => a.id === drag.id)
          if (annotation && annotation.kind === 'text') {
            annotation.x = Math.max(-0.05, Math.min(1.05, drag.originX + dx))
            annotation.y = Math.max(-0.05, Math.min(1.05, drag.originY + dy))
          }
        },
        { coalesceKey: `drag:${drag.id}` },
      )
    },
    [drag, hover, interactive, highlightsCategories, nearestDatum, scaleOf, scene.width, scene.plot.width, scene.plot.height, update],
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!drag) return
      try {
        svgRef.current?.releasePointerCapture(event.pointerId)
      } catch {
        // nada a liberar
      }
      setDrag(null)
    },
    [drag],
  )

  const onClick = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!interactive || drag?.moved) return
      const target = event.target as Element

      const handle = target.getAttribute('data-handle')
      if (handle === 'title' || handle === 'subtitle' || handle === 'source' || handle === 'credit') {
        setStep('anotar')
        return
      }
      if (handle?.startsWith('annotation:')) {
        selectAnnotation(handle.slice('annotation:'.length))
        setStep('anotar')
        return
      }

      const series = target.getAttribute('data-series')
      const category = target.getAttribute('data-category')
      const key = highlightsCategories ? category : series
      if (!key) return

      update((draft) => {
        const list = highlightsCategories ? draft.highlight.categories : draft.highlight.series
        const index = list.indexOf(key)
        if (index >= 0) list.splice(index, 1)
        else list.push(key)
      })
    },
    [interactive, drag, highlightsCategories, update, selectAnnotation, setStep],
  )

  /** Crosshair faz sentido onde a posição ao longo do eixo x é leitura. */
  const showCrosshair =
    spec.chart.type === 'line' || spec.chart.type === 'area' || spec.chart.type === 'scatter'

  const hoverColor = useMemo(
    () => (hover ? scene.series.find((s) => s.name === hover.series)?.color : undefined),
    [hover, scene.series],
  )

  return (
    <div
      className={
        'canvas-shell' + (spec.theme.overrides.background === 'transparent' ? ' transparent-bg' : '')
      }
      style={{ width: `min(100%, max(${scene.width}px, 72vw))` }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        width={scene.width}
        height={scene.height}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={spec.text.title || 'Gráfico'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
      >
        {interactive && hover && showCrosshair && (
          <line
            className="crosshair"
            x1={hover.svgX}
            y1={scene.plot.y}
            x2={hover.svgX}
            y2={scene.plot.y + scene.plot.height}
          />
        )}
        <HoverContext.Provider value={{ key: hover?.key ?? null, highlightsCategories }}>
          {scene.nodes.map((node, i) => (
            <SceneNodeView key={i} node={node} index={i} />
          ))}
        </HoverContext.Provider>
      </svg>
      {hover && Number.isFinite(hover.value) && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(hover.x + 14, scene.width - 40), top: Math.max(hover.y - 44, 4) }}
        >
          <b>
            {hoverColor && <i className="swatch" style={{ background: hoverColor }} />}
            {hover.series}
          </b>
          <span>{hover.category}</span>
          <em>
            {formatNumber(hover.value, null, spec.data.locale)}
            {spec.axes.y.unit ? ` ${spec.axes.y.unit}` : ''}
          </em>
        </div>
      )}
    </div>
  )
}
