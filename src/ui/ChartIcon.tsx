/**
 * Ícones dos tipos de gráfico.
 *
 * Miniaturas da forma real, não pictogramas genéricos: o usuário escolhe pelo
 * desenho, e um ícone que não parece com o resultado atrapalha mais que ajuda.
 */

import type { ChartType } from '../core/types'

const W = 22
const H = 16

function Bars({ horizontal = false }: { horizontal?: boolean }) {
  const values = [0.55, 0.85, 0.4, 0.7]
  return (
    <>
      {values.map((v, i) =>
        horizontal ? (
          <rect key={i} x={0} y={i * 4 + 0.5} width={v * W} height={3} rx={0.5} />
        ) : (
          <rect key={i} x={i * 5.5 + 0.5} y={H - v * H} width={4} height={v * H} rx={0.5} />
        ),
      )}
    </>
  )
}

export function ChartIcon({ type }: { type: ChartType }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }

  const content = () => {
    switch (type) {
      case 'bar':
        return <Bars />
      case 'bar-horizontal':
        return <Bars horizontal />
      case 'line':
        return <polyline points="0,13 5,8 10,10 15,3 22,5" {...stroke} strokeLinejoin="round" />
      case 'area':
        return (
          <>
            <path d="M0,13 5,8 10,10 15,3 22,5 22,16 0,16Z" opacity={0.35} />
            <polyline points="0,13 5,8 10,10 15,3 22,5" {...stroke} />
          </>
        )
      case 'scatter':
        return (
          <>
            {[
              [3, 12],
              [8, 7],
              [11, 10],
              [15, 4],
              [19, 6],
            ].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={1.8} />
            ))}
          </>
        )
      case 'dumbbell':
        return (
          <>
            {[3, 8, 13].map((y, i) => (
              <g key={i}>
                <line x1={3 + i * 2} y1={y} x2={16 - i} y2={y} stroke="currentColor" strokeWidth={1.4} />
                <circle cx={3 + i * 2} cy={y} r={2} />
                <circle cx={16 - i} cy={y} r={2} opacity={0.5} />
              </g>
            ))}
          </>
        )
      case 'slope':
        return (
          <>
            <line x1={4} y1={2} x2={18} y2={12} {...stroke} />
            <line x1={4} y1={9} x2={18} y2={5} {...stroke} opacity={0.5} />
            <circle cx={4} cy={2} r={1.6} />
            <circle cx={18} cy={12} r={1.6} />
            <circle cx={4} cy={9} r={1.6} opacity={0.5} />
            <circle cx={18} cy={5} r={1.6} opacity={0.5} />
          </>
        )
      case 'lollipop':
        return (
          <>
            {[0.5, 0.85, 0.35, 0.65].map((v, i) => (
              <g key={i}>
                <line x1={0} y1={i * 4 + 2} x2={v * W - 2} y2={i * 4 + 2} stroke="currentColor" strokeWidth={1.3} />
                <circle cx={v * W - 2} cy={i * 4 + 2} r={1.9} />
              </g>
            ))}
          </>
        )
      case 'bullet':
        return (
          <>
            {[0.7, 0.45].map((v, i) => (
              <g key={i}>
                <rect x={0} y={i * 8 + 1} width={W} height={6} opacity={0.16} />
                <rect x={0} y={i * 8 + 2.5} width={v * W} height={3} />
                <rect x={v * W + 3} y={i * 8 + 1} width={1.6} height={6} />
              </g>
            ))}
          </>
        )
      case 'histogram':
        return (
          <>
            {[0.25, 0.55, 0.95, 0.7, 0.3].map((v, i) => (
              <rect key={i} x={i * 4.4} y={H - v * H} width={4} height={v * H} />
            ))}
          </>
        )
      case 'boxplot':
        return (
          <>
            {[0, 1].map((i) => (
              <g key={i}>
                <line x1={5 + i * 11} y1={1} x2={5 + i * 11} y2={15} stroke="currentColor" strokeWidth={1.2} />
                <rect x={1.5 + i * 11} y={4 + i * 2} width={7} height={7} fill="none" stroke="currentColor" strokeWidth={1.3} />
                <line x1={1.5 + i * 11} y1={7.5 + i * 2} x2={8.5 + i * 11} y2={7.5 + i * 2} stroke="currentColor" strokeWidth={1.6} />
              </g>
            ))}
          </>
        )
      case 'donut':
        return (
          <>
            <circle cx={11} cy={8} r={6.5} fill="none" stroke="currentColor" strokeWidth={3.4} opacity={0.3} />
            <path d="M11,1.5 A6.5,6.5 0 0 1 16.6,11.3" fill="none" stroke="currentColor" strokeWidth={3.4} />
          </>
        )
      case 'waffle':
        return (
          <>
            {Array.from({ length: 16 }, (_, i) => (
              <rect
                key={i}
                x={(i % 4) * 4.4 + 2.5}
                y={Math.floor(i / 4) * 4 + 0.5}
                width={3.2}
                height={3.2}
                rx={0.6}
                opacity={i < 7 ? 1 : 0.3}
              />
            ))}
          </>
        )
      case 'treemap':
        return (
          <>
            <rect x={0} y={0} width={12} height={16} />
            <rect x={13} y={0} width={9} height={9} opacity={0.6} />
            <rect x={13} y={10} width={9} height={6} opacity={0.35} />
          </>
        )
      case 'waterfall':
        return (
          <>
            <rect x={0.5} y={9} width={4} height={6} />
            <rect x={5.5} y={5} width={4} height={5} opacity={0.55} />
            <rect x={10.5} y={7} width={4} height={4} />
            <rect x={15.5} y={2} width={6} height={6} opacity={0.55} />
          </>
        )
      case 'big-number':
        return (
          <>
            <text x={0} y={10} fontSize={11} fontWeight={700} fontFamily="inherit" fill="currentColor">
              42
            </text>
            <polyline points="1,14 6,12 11,13 16,10 21,12" {...stroke} strokeWidth={1.2} />
          </>
        )
      case 'heatmap':
        return (
          <>
            {[
              [0.9, 0.55, 0.3],
              [0.35, 0.7, 0.45],
              [0.2, 0.4, 0.85],
            ].map((row, r) =>
              row.map((v, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={c * 7.4}
                  y={r * 5.2}
                  width={6.6}
                  height={4.6}
                  rx={0.8}
                  opacity={0.25 + v * 0.75}
                />
              )),
            )}
          </>
        )
    }
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="currentColor" aria-hidden="true">
      {content()}
    </svg>
  )
}
