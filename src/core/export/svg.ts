/**
 * Serialização da cena para SVG.
 *
 * O mesmo arquivo alimenta o download em vetor, a rasterização em PNG e o
 * embed. Como o tema usa apenas pilhas de fontes do sistema, o SVG resultante
 * é autossuficiente: não referencia nada externo e rasteriza com a tipografia
 * certa.
 */

import type { Scene, SceneNode } from '../types'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Arredonda coordenadas: 2 casas bastam e encolhem o arquivo em ~20%. */
function n(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '0'
}

function attrs(pairs: Array<[string, string | number | undefined]>): string {
  return pairs
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ` ${key}="${typeof value === 'number' ? n(value) : escapeXml(String(value))}"`)
    .join('')
}

function baselineAttr(baseline: string | undefined): string | undefined {
  if (baseline === 'middle') return 'central'
  if (baseline === 'hanging') return 'hanging'
  return undefined
}

export function nodeToSvg(node: SceneNode): string {
  const opacity = node.opacity !== undefined && node.opacity !== 1 ? node.opacity : undefined

  switch (node.t) {
    case 'rect':
      return `<rect${attrs([
        ['x', node.x],
        ['y', node.y],
        ['width', Math.max(0, node.w)],
        ['height', Math.max(0, node.h)],
        ['rx', node.rx],
        ['fill', node.fill],
        ['stroke', node.stroke],
        ['stroke-width', node.strokeWidth],
        ['opacity', opacity],
      ])}/>`

    case 'line':
      return `<line${attrs([
        ['x1', node.x1],
        ['y1', node.y1],
        ['x2', node.x2],
        ['y2', node.y2],
        ['stroke', node.stroke],
        ['stroke-width', node.strokeWidth ?? 1],
        ['stroke-dasharray', node.dash],
        ['stroke-linecap', node.linecap],
        ['opacity', opacity],
      ])}/>`

    case 'circle':
      return `<circle${attrs([
        ['cx', node.cx],
        ['cy', node.cy],
        ['r', Math.max(0, node.r)],
        ['fill', node.fill],
        ['stroke', node.stroke],
        ['stroke-width', node.strokeWidth],
        ['opacity', opacity],
      ])}/>`

    case 'path':
      return `<path${attrs([
        ['d', node.d],
        ['fill', node.fill ?? 'none'],
        ['stroke', node.stroke],
        ['stroke-width', node.strokeWidth],
        ['stroke-dasharray', node.dash],
        ['stroke-linecap', node.linecap],
        ['stroke-linejoin', node.linejoin],
        ['opacity', opacity],
      ])}/>`

    case 'text': {
      // O halo é traçado antes do preenchimento (paint-order), o que dá o
      // contorno da cor do fundo sem engordar o desenho da letra.
      const halo = node.halo
        ? attrs([
            ['stroke', node.halo],
            ['stroke-width', node.haloWidth ?? 3],
            ['stroke-linejoin', 'round'],
            ['paint-order', 'stroke'],
          ])
        : ''
      return `<text${attrs([
        ['x', node.x],
        ['y', node.y],
        ['fill', node.fill],
        ['font-size', node.size],
        ['font-weight', node.weight],
        ['font-family', node.family],
        ['text-anchor', node.anchor],
        ['dominant-baseline', baselineAttr(node.baseline)],
        ['letter-spacing', node.letterSpacing],
        ['opacity', opacity],
      ])}${halo}>${escapeXml(node.text)}</text>`
    }

    case 'g':
      return `<g${attrs([
        ['transform', node.transform],
        ['opacity', opacity],
      ])}>${node.children.map(nodeToSvg).join('')}</g>`
  }
}

export interface SvgOptions {
  /** Inclui o cabeçalho XML, necessário para arquivos `.svg` avulsos. */
  standalone?: boolean
  /** Faz o SVG acompanhar a largura do contêiner. Usado no embed. */
  responsive?: boolean
  title?: string
  description?: string
}

export function sceneToSvg(scene: Scene, options: SvgOptions = {}): string {
  const body = scene.nodes.map(nodeToSvg).join('')

  const size = options.responsive
    ? ' width="100%" height="auto"'
    : ` width="${n(scene.width)}" height="${n(scene.height)}"`

  // `role`/`aria-label` fazem o leitor de tela anunciar o gráfico pelo título
  // em vez de ignorá-lo como decoração.
  const meta =
    (options.title ? `<title>${escapeXml(options.title)}</title>` : '') +
    (options.description ? `<desc>${escapeXml(options.description)}</desc>` : '')

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${n(scene.width)} ${n(scene.height)}"${size} ` +
    `role="img"${options.title ? ` aria-label="${escapeXml(options.title)}"` : ''} ` +
    `style="max-width:100%;height:auto;display:block">` +
    meta +
    body +
    `</svg>`

  return options.standalone ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}` : svg
}
