/**
 * Verificação de acessibilidade de cor: contraste WCAG e simulação de daltonismo.
 *
 * Sem dependências externas de propósito — são poucas fórmulas fechadas, e
 * mantê-las aqui deixa tudo testável sem DOM e sem instalar mais nada.
 */

export interface RGB {
  r: number
  g: number
  b: number
}

export type ColorVisionDeficiency = 'protanopia' | 'deuteranopia' | 'tritanopia'

/** Aceita `#rgb`, `#rrggbb` e `rgb(r, g, b)`. Devolve null se não reconhecer. */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase()

  if (s.startsWith('#')) {
    const hex = s.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return Number.isNaN(r + g + b) ? null : { r, g, b }
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return Number.isNaN(r + g + b) ? null : { r, g, b }
    }
    return null
  }

  const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  }
  return null
}

export function toHex({ r, g, b }: RGB): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Luminância relativa conforme WCAG 2.1. */
export function relativeLuminance(color: RGB): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return (
    0.2126 * channel(color.r) +
    0.7152 * channel(color.g) +
    0.0722 * channel(color.b)
  )
}

/** Razão de contraste WCAG entre duas cores: de 1 (igual) a 21 (preto/branco). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return 1
  const la = relativeLuminance(ca)
  const lb = relativeLuminance(cb)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export interface ContrastCheck {
  ratio: number
  /** Texto normal precisa de 4.5:1. */
  aa: boolean
  /** Texto grande (>=18.66px negrito ou >=24px) precisa de 3:1. */
  aaLarge: boolean
  aaa: boolean
}

export function checkContrast(fg: string, bg: string): ContrastCheck {
  const ratio = contrastRatio(fg, bg)
  return {
    ratio,
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
  }
}

/** Escolhe preto ou branco — o que tiver mais contraste sobre o fundo dado. */
export function readableTextOn(background: string): string {
  return contrastRatio('#ffffff', background) >= contrastRatio('#111111', background)
    ? '#ffffff'
    : '#111111'
}

// ---------------------------------------------------------------------------
// Simulação de daltonismo (Viénot, Brettel & Mollon, 1999)
// ---------------------------------------------------------------------------

const RGB_TO_LMS = [
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
]

const LMS_TO_RGB = [
  [0.080944, -0.130504, 0.116721],
  [-0.0102485, 0.0540194, -0.113615],
  [-0.000365294, -0.00412163, 0.693513],
]

const DEFICIENCY_MATRIX: Record<ColorVisionDeficiency, number[][]> = {
  protanopia: [
    [0, 2.02344, -2.52581],
    [0, 1, 0],
    [0, 0, 1],
  ],
  deuteranopia: [
    [1, 0, 0],
    [0.494207, 0, 1.24827],
    [0, 0, 1],
  ],
  tritanopia: [
    [1, 0, 0],
    [0, 1, 0],
    [-0.395913, 0.801109, 0],
  ],
}

function apply(matrix: number[][], v: number[]): number[] {
  return matrix.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
}

/** Devolve a cor como seria percebida por quem tem a deficiência informada. */
export function simulateColorVision(
  color: string,
  kind: ColorVisionDeficiency,
): string {
  const rgb = parseColor(color)
  if (!rgb) return color

  // A conversão opera em luz linear, não em sRGB com gamma.
  const linear = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const encode = (v: number) => {
    const c = Math.max(0, Math.min(1, v))
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    return s * 255
  }

  const lin = [linear(rgb.r), linear(rgb.g), linear(rgb.b)].map((v) => v * 255)
  const lms = apply(RGB_TO_LMS, lin)
  const sim = apply(DEFICIENCY_MATRIX[kind], lms)
  const back = apply(LMS_TO_RGB, sim).map((v) => v / 255)

  return toHex({ r: encode(back[0]), g: encode(back[1]), b: encode(back[2]) })
}

/** Distância perceptual aproximada (CIE76 sobre Lab). Suficiente para "essas duas cores colidem?". */
export function colorDistance(a: string, b: string): number {
  const la = toLab(a)
  const lb = toLab(b)
  if (!la || !lb) return Infinity
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2])
}

function toLab(color: string): [number, number, number] | null {
  const rgb = parseColor(color)
  if (!rgb) return null
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const r = lin(rgb.r)
  const g = lin(rgb.g)
  const b = lin(rgb.b)

  // sRGB -> XYZ (D65)
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export interface PaletteAudit {
  /** Pares de cores que ficam indistinguíveis para alguma deficiência. */
  collisions: Array<{
    a: string
    b: string
    kind: ColorVisionDeficiency
    distance: number
  }>
  /** Cores que não alcançam 3:1 contra o fundo — invisíveis como marca fina. */
  lowContrast: Array<{ color: string; ratio: number }>
}

export interface AuditThresholds {
  /** Limiar para protanopia e deuteranopia, as deficiencias comuns. */
  redGreen: number
  /** Limiar para tritanopia, cuja prevalencia e ordens de grandeza menor. */
  tritan: number
}

/**
 * Limiares padrao, em distancia CIE76 apos simulacao.
 *
 * Nao sao iguais de proposito. Protanopia e deuteranopia somam cerca de 8% dos
 * homens; tritanopia fica na casa de 0,01%. Cobrar o mesmo rigor das tres faria
 * o aviso disparar em praticamente qualquer paleta quente de cinco cores — e um
 * aviso que sempre aparece e um aviso que ninguem le.
 */
export const DEFAULT_THRESHOLDS: AuditThresholds = { redGreen: 8, tritan: 5 }

/**
 * Audita uma paleta inteira contra as tres deficiencias e contra o fundo.
 *
 * Cores abaixo de 3:1 de contraste com o fundo entram em `lowContrast`: uma
 * linha fina nessa cor simplesmente some.
 */
export function auditPalette(
  palette: string[],
  background: string,
  thresholds: number | Partial<AuditThresholds> = DEFAULT_THRESHOLDS,
): PaletteAudit {
  const limits: AuditThresholds =
    typeof thresholds === 'number'
      ? { redGreen: thresholds, tritan: thresholds }
      : { ...DEFAULT_THRESHOLDS, ...thresholds }

  const kinds: ColorVisionDeficiency[] = ['protanopia', 'deuteranopia', 'tritanopia']
  const collisions: PaletteAudit['collisions'] = []

  for (const kind of kinds) {
    const limit = kind === 'tritanopia' ? limits.tritan : limits.redGreen
    const simulated = palette.map((c) => simulateColorVision(c, kind))
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const distance = colorDistance(simulated[i], simulated[j])
        if (distance < limit) {
          collisions.push({ a: palette[i], b: palette[j], kind, distance })
        }
      }
    }
  }

  const lowContrast = palette
    .map((color) => ({ color, ratio: contrastRatio(color, background) }))
    .filter((c) => c.ratio < 3)

  return { collisions, lowContrast }
}

/** Mistura duas cores em espaço linear. `t` = 0 devolve `a`, 1 devolve `b`. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return a
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  })
}

/** Versão translúcida de uma cor, achatada contra o fundo (SVG sem alpha real). */
export function fade(color: string, amount: number, background: string): string {
  return mix(background, color, Math.max(0, Math.min(1, amount)))
}
