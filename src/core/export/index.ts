/**
 * Saídas: PNG, SVG, arquivo de projeto e embed.
 *
 * Sobre o PNG: o caminho é SVG → Blob → `Image` → `canvas`. Uma armadilha
 * conhecida desse caminho é a tipografia — um SVG carregado como imagem é um
 * documento isolado e não enxerga fontes web declaradas na página. Por isso os
 * temas usam apenas pilhas de fontes do sistema, que resolvem normalmente
 * dentro do documento isolado. Nenhuma fonte precisa ser embutida, e o arquivo
 * fica pequeno.
 */

import type { ChartSpec, Scene } from '../types'
import { serializeSpec } from '../schema'
import { sceneToSvg } from './svg'

export { sceneToSvg, nodeToSvg } from './svg'

function slug(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'grafico'
}

export function fileNameFor(spec: ChartSpec, extension: string): string {
  return `${slug(spec.text.title || spec.chart.type)}.${extension}`
}

/** Dispara o download de um blob no navegador. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revogar cedo demais cancela o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function downloadSvg(scene: Scene, spec: ChartSpec): void {
  const svg = sceneToSvg(scene, {
    standalone: true,
    title: spec.text.title,
    description: spec.text.subtitle,
  })
  download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), fileNameFor(spec, 'svg'))
}

export function downloadSpec(spec: ChartSpec): void {
  download(
    new Blob([serializeSpec(spec)], { type: 'application/json' }),
    fileNameFor(spec, 'datastories.json'),
  )
}

/** Rasteriza a cena. `scale` 2 ou 3 para telas de alta densidade e impressão. */
export async function sceneToPngBlob(scene: Scene, scale = 2): Promise<Blob> {
  const svg = sceneToSvg(scene, { standalone: true })
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(scene.width * scale)
    canvas.height = Math.round(scene.height * scale)

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível criar o contexto 2D para exportar o PNG.')

    // O SVG já pinta o próprio fundo, mas um PNG sem base fica com halo cinza
    // quando o navegador aplica antialiasing nas bordas.
    ctx.fillStyle = scene.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('Falha ao gerar o PNG.')),
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Falha ao rasterizar o SVG.'))
    image.src = url
  })
}

export async function downloadPng(scene: Scene, spec: ChartSpec, scale = 2): Promise<void> {
  const blob = await sceneToPngBlob(scene, scale)
  download(blob, fileNameFor(spec, scale === 1 ? 'png' : `@${scale}x.png`))
}

/**
 * Página HTML autocontida com o gráfico.
 *
 * Sem scripts, sem rede, sem fontes externas: um arquivo que abre igual em
 * qualquer lugar e pode ser colado num CMS via iframe. O SVG é responsivo, então
 * o embed acompanha a largura do contêiner.
 */
export function buildEmbedHtml(scene: Scene, spec: ChartSpec): string {
  const svg = sceneToSvg(scene, {
    responsive: true,
    title: spec.text.title,
    description: spec.text.subtitle,
  })

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(spec.text.title || 'Gráfico')}</title>
<style>
  html, body { margin: 0; padding: 0; background: ${scene.background}; }
  .datastories-embed { max-width: ${Math.round(scene.width)}px; margin: 0 auto; }
  .datastories-embed svg { width: 100%; height: auto; display: block; }
</style>
</head>
<body>
<div class="datastories-embed">${svg}</div>
</body>
</html>
`
}

export function downloadEmbed(scene: Scene, spec: ChartSpec): void {
  download(
    new Blob([buildEmbedHtml(scene, spec)], { type: 'text/html;charset=utf-8' }),
    fileNameFor(spec, 'embed.html'),
  )
}

/** Trecho de iframe pronto para colar, com o HTML embutido em `srcdoc`. */
export function buildIframeSnippet(scene: Scene, spec: ChartSpec): string {
  const html = buildEmbedHtml(scene, spec).replace(/"/g, '&quot;')
  return `<iframe title="${spec.text.title || 'Gráfico'}" style="width:100%;max-width:${Math.round(
    scene.width,
  )}px;height:${Math.round(scene.height)}px;border:0" srcdoc="${html}"></iframe>`
}
