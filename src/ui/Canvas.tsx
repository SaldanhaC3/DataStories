/**
 * Área de desenho.
 *
 * A cena vem pronta do núcleo; aqui ela vira JSX e ganha interação direta:
 * clicar numa marca destaca a série (ou a categoria, nos gráficos de
 * composição) e arrastar uma anotação a reposiciona. Editar direto no gráfico
 * é mais rápido do que caçar o controle equivalente no painel, e é o que se
 * espera de uma ferramenta de acabamento.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ChartSpec, Scene, SceneNode, ScenePoint } from '../core/types'
import { getChartDefinition } from '../core/render'
import { formatNumber } from '../core/format'
import { useEditor } from '../state/store'
import { ColorInput, Chip } from './controls'

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
  /** Largura da moldura em pixels de tela — o tooltip é posicionado nessa régua. */
  shellW: number
}

/** Marca clicada, com a posição do clique para ancorar o popover de edição. */
interface MarkSelection {
  series: string
  category: string
  value: number
  x: number
  y: number
  shellW: number
  shellH: number
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
  } else if (node.handle === 'legend') {
    className = 'draggable-legend'
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
  /** O que o arrasto move: a caixa de texto, a ponta da seta ou a legenda. */
  mode: 'text' | 'target' | 'legend'
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
  const [selected, setSelected] = useState<MarkSelection | null>(null)
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
      if (!handle) return

      // Legenda: o arrasto dela não depende de anotação nenhuma.
      if (handle === 'legend') {
        event.preventDefault()
        try {
          svgRef.current?.setPointerCapture(event.pointerId)
        } catch {
          // sem captura, seguimos com o arrasto simples
        }
        // Onde a legenda está agora: lido da própria cena, cobre tanto o caso
        // já posicionado quanto o padrão (topo do painel), sem repetir aqui a
        // conta de layout do renderizador.
        let ax = scene.plot.x
        let ay = scene.plot.y - 18
        for (const node of scene.nodes) {
          if (node.handle !== 'legend') continue
          const nx = node.t === 'rect' ? node.x : node.t === 'text' ? node.x : Infinity
          const ny = node.t === 'rect' ? node.y : node.t === 'text' ? node.y : Infinity
          if (nx < ax) ax = nx
          if (ny < ay) ay = ny
        }
        setDrag({
          id: 'legend',
          mode: 'legend',
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          originX: ax / scene.width,
          originY: ay / scene.height,
          moved: false,
        })
        return
      }

      if (!handle.startsWith('annotation:')) return

      const id = handle.slice('annotation:'.length)
      const isTarget = id.endsWith(':target')
      const annotationId = isTarget ? id.slice(0, -':target'.length) : id
      const annotation = spec.annotations.find((a) => a.id === annotationId)
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
      selectAnnotation(annotationId)
      setDrag({
        id: annotationId,
        mode: isTarget ? 'target' : 'text',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: isTarget ? annotation.connector.tx : annotation.x,
        originY: isTarget ? annotation.connector.ty : annotation.y,
        moved: false,
      })
    },
    [interactive, spec.annotations, selectAnnotation, scene.nodes, scene.plot, scene.width, scene.height],
  )

  /**
   * Índice de pontos ordenado por x.
   *
   * A cena entrega as posições prontas (`scene.points`), então achar o valor
   * sob o cursor é uma busca binária num array — não uma varredura do DOM com
   * `getBoundingClientRect` por elemento, que era o custo do desenho anterior e
   * rodava a cada movimento do mouse.
   */
  const index = useMemo(
    () => [...scene.points].sort((a, b) => a.x - b.x),
    [scene.points],
  )

  const nearestPoint = useCallback(
    (svgX: number, svgY: number): ScenePoint | null => {
      if (index.length === 0) return null

      let lo = 0
      let hi = index.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (index[mid].x < svgX) lo = mid + 1
        else hi = mid
      }

      // Janela em torno do x mais próximo. O peso maior no eixo horizontal faz
      // o cursor "grudar" na coluna de dados, como num crosshair: entre duas
      // séries empilhadas na vertical, quem decide é a distância vertical.
      const TOLERANCIA = 32
      let best: ScenePoint | null = null
      let bestScore = Infinity
      const consider = (i: number) => {
        const dx = index[i].x - svgX
        const dy = index[i].y - svgY
        const score = dx * dx * 4 + dy * dy
        if (score < bestScore) {
          bestScore = score
          best = index[i]
        }
      }
      for (let i = lo; i < index.length && index[i].x - svgX <= TOLERANCIA; i++) consider(i)
      for (let i = lo - 1; i >= 0 && svgX - index[i].x <= TOLERANCIA; i--) consider(i)
      return best
    },
    [index],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Tooltip. O cursor não precisa acertar a marca: basta estar dentro do
      // painel, e o ponto mais próximo responde. É como se lê um gráfico de
      // linha no jornal — ninguém mira no pixel do ponto.
      if (interactive && !drag) {
        const svg = svgRef.current
        const shell = svg?.parentElement
        const svgRect = svg?.getBoundingClientRect()

        if (svg && shell && svgRect && svgRect.width > 0) {
          const scale = scene.width / svgRect.width
          const svgX = (event.clientX - svgRect.left) * scale
          const svgY = (event.clientY - svgRect.top) * scale
          const { plot } = scene
          const dentroDoPainel =
            svgX >= plot.x - 8 &&
            svgX <= plot.x + plot.width + 8 &&
            svgY >= plot.y - 8 &&
            svgY <= plot.y + plot.height + 8

          // Uma marca sob o cursor tem prioridade sobre o vizinho mais próximo:
          // em barras agrupadas, o ponteiro em cima de uma barra deve ler
          // aquela barra, não a de centro mais próximo.
          const target = event.target as Element
          const direta = target.getAttribute('data-series')
          const valorDireto = Number(target.getAttribute('data-value'))

          const achado =
            direta != null && Number.isFinite(valorDireto)
              ? {
                  series: direta,
                  category: target.getAttribute('data-category') ?? '',
                  value: valorDireto,
                }
              : dentroDoPainel
                ? nearestPoint(svgX, svgY)
                : null

          if (achado) {
            const rect = shell.getBoundingClientRect()
            setHover({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              series: achado.series,
              category: achado.category,
              value: achado.value,
              key: highlightsCategories ? achado.category : achado.series,
              svgX,
              shellW: rect.width,
            })
          } else if (hover) {
            setHover(null)
          }
        }
      }

      if (!drag || event.pointerId !== drag.pointerId) return
      const scale = scaleOf()
      const dxPx = (event.clientX - drag.startClientX) * scale
      const dyPx = (event.clientY - drag.startClientY) * scale
      const dx = dxPx / scene.plot.width
      const dy = dyPx / scene.plot.height
      if (!drag.moved && Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002) return

      setDrag({ ...drag, moved: true })
      // A mesma chave de fusão em todo o arrasto: um Ctrl+Z desfaz o movimento
      // inteiro, não cada pixel.
      update(
        (draft) => {
          const clamp01 = (v: number) => Math.max(-0.05, Math.min(1.05, v))
          if (drag.mode === 'legend') {
            // A legenda anda em fração do quadro inteiro, não do painel.
            draft.labels.legendPos = {
              x: Math.max(0.01, Math.min(0.99, drag.originX + dxPx / scene.width)),
              y: Math.max(0.01, Math.min(0.99, drag.originY + dyPx / scene.height)),
            }
            return
          }
          const annotation = draft.annotations.find((a) => a.id === drag.id)
          if (annotation && annotation.kind === 'text') {
            if (drag.mode === 'target') {
              annotation.connector.tx = clamp01(drag.originX + dx)
              annotation.connector.ty = clamp01(drag.originY + dy)
            } else {
              annotation.x = clamp01(drag.originX + dx)
              annotation.y = clamp01(drag.originY + dy)
            }
          }
        },
        { coalesceKey: `drag:${drag.id}:${drag.mode}` },
      )
    },
    [
      drag,
      hover,
      interactive,
      highlightsCategories,
      nearestPoint,
      scaleOf,
      scene.width,
      scene.plot,
      update,
    ],
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
      if (!key) {
        // Clique no vazio deseleciona: é o mesmo gesto de fechar o popover.
        setSelected(null)
        return
      }

      update((draft) => {
        const list = highlightsCategories ? draft.highlight.categories : draft.highlight.series
        const index = list.indexOf(key)
        if (index >= 0) list.splice(index, 1)
        else list.push(key)
      })

      const shell = svgRef.current?.parentElement
      const rect = shell?.getBoundingClientRect()
      setSelected({
        series: series ?? '',
        category: category ?? '',
        value: Number(target.getAttribute('data-value')),
        x: rect ? event.clientX - rect.left : 0,
        y: rect ? event.clientY - rect.top : 0,
        shellW: rect?.width ?? 0,
        shellH: rect?.height ?? 0,
      })
    },
    [interactive, drag, highlightsCategories, update, selectAnnotation, setStep],
  )

  // Esc fecha o popover da marca — o atalho global do App cuida dos diálogos,
  // mas não sabe que esta seleção existe.
  useEffect(() => {
    if (!selected) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  /**
   * Onde a cor individual desta marca vive no spec.
   *
   * Uma série só: a chave é o rótulo da categoria (lido por `markColor`).
   * Várias séries: chave composta `série :: categoria`, também lida pela
   * engine — pinta uma única barra sem tocar nas irmãs da série. Gráficos de
   * composição (rosca, waffle, treemap) já liam overrides por categoria antes.
   */
  const selectionOverrideKey = selected
    ? highlightsCategories || scene.series.length <= 1
      ? selected.category
      : `${selected.series} :: ${selected.category}`
    : null
  const selectionHighlighted = selected
    ? (highlightsCategories ? spec.highlight.categories : spec.highlight.series).includes(
        highlightsCategories ? selected.category : selected.series,
      )
    : false
  const selectionFallback =
    selected?.series != null && selected.series !== ''
      ? scene.series.find((s) => s.name === selected.series)?.color ?? '#1f6feb'
      : '#1f6feb'

  /** Crosshair faz sentido onde a posição ao longo do eixo x é leitura. */
  const showCrosshair =
    spec.chart.type === 'line' || spec.chart.type === 'area' || spec.chart.type === 'scatter'

  const hoverColor = useMemo(
    () => (hover ? scene.series.find((s) => s.name === hover.series)?.color : undefined),
    [hover, scene.series],
  )

  /**
   * O tooltip lê o mesmo formato configurado para os rótulos das marcas: se a
   * pessoa pediu "R$ " na frente e uma casa decimal, o balão de hover que
   * mostrar outra coisa está contando outra história.
   */
  const formatHover = useMemo(() => {
    const vf = spec.labels.valueFormat
    return (value: number) => {
      if (!vf) return formatNumber(value, null, spec.data.locale)
      const mark = vf.group ? ',' : ''
      const decimals = vf.decimals ?? (Number.isInteger(value) ? 0 : 2)
      return `${vf.prefix}${formatNumber(value, `${mark}.${decimals}f`, spec.data.locale)}${vf.suffix}`
    }
  }, [spec.labels.valueFormat, spec.data.locale])

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
          // `hover.x/y` estão em pixels de tela e `scene.width` em unidades do
          // SVG: como o SVG é escalado para caber na moldura, misturar as duas
          // réguas fazia o limite não valer nada e o tooltip escapava pela
          // direita. Aqui a conta toda é feita na largura real da moldura, e
          // perto da borda o balão vira para o outro lado do cursor.
          style={{
            left: hover.x + (hover.x > hover.shellW - 170 ? -14 : 14),
            top: Math.max(hover.y - 44, 4),
            transform: hover.x > hover.shellW - 170 ? 'translateX(-100%)' : undefined,
          }}
        >
          <b>
            {hoverColor && <i className="swatch" style={{ background: hoverColor }} />}
            {hover.series}
          </b>
          <span>{hover.category}</span>
          <em>
            {formatHover(hover.value)}
            {spec.axes.y.unit ? ` ${spec.axes.y.unit}` : ''}
          </em>
        </div>
      )}
      {selected && interactive && (
        <div
          className="mark-popover"
          // Perto da borda direita o popover vira para não sair do quadro —
          // mesma régua de tela do tooltip.
          style={{
            left: Math.max(8, Math.min(selected.x, selected.shellW - 216)),
            // ~130px é a altura do popover; perto da base ele sobe em vez de
            // ser cortado pelo overflow da moldura.
            top: Math.max(8, Math.min(selected.y + 16, selected.shellH - 140)),
          }}
        >
          <header className="mark-popover-head">
            <b>{selected.series || selected.category}</b>
            {selected.category && selected.series && <span>{selected.category}</span>}
            <button
              type="button"
              aria-label="Fechar edição da marca"
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </header>
          <div className="mark-popover-body">
            <Chip
              label={selectionHighlighted ? 'Destacado' : 'Destacar'}
              active={selectionHighlighted}
              onClick={() =>
                update((draft) => {
                  const list = highlightsCategories
                    ? draft.highlight.categories
                    : draft.highlight.series
                  const key = highlightsCategories ? selected.category : selected.series
                  const index = list.indexOf(key)
                  if (index >= 0) list.splice(index, 1)
                  else list.push(key)
                })
              }
            />
            <ColorInput
              value={selectionOverrideKey ? spec.color.overrides[selectionOverrideKey] ?? null : null}
              fallback={selectionFallback}
              onChange={(value) =>
                update((draft) => {
                  if (!selectionOverrideKey) return
                  if (value === null) delete draft.color.overrides[selectionOverrideKey]
                  else draft.color.overrides[selectionOverrideKey] = value
                })
              }
            />
          </div>
          {Number.isFinite(selected.value) && (
            <footer className="mark-popover-foot">
              {formatHover(selected.value)}
              {spec.axes.y.unit ? ` ${spec.axes.y.unit}` : ''}
            </footer>
          )}
        </div>
      )}
    </div>
  )
}
