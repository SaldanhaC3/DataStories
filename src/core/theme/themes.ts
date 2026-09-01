/**
 * Temas prontos.
 *
 * Uma decisão deliberada: só usamos pilhas de fontes do sistema, nunca fontes
 * web. O motivo é o export. Um SVG rasterizado via `<img>` para canvas é um
 * documento isolado — fontes carregadas por `@font-face` na página hospedeira
 * não chegam nele, e o PNG sai com a fonte errada. Nomes de fonte do sistema,
 * ao contrário, resolvem normalmente. Isso também deixa o embed independente
 * de rede, sem embutir megabytes de base64.
 */

import type { Theme, ThemeTokens } from '../types'
import { ACCESSIBLE, EDITORIAL, NEWSROOM, NOCTURNE } from './palettes'
import { SEQ_BLUE, SEQ_WARM, DIV_RED_BLUE, DIV_BROWN_TEAL } from './palettes'

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const SERIF = 'Georgia, "Times New Roman", "Nimbus Roman", serif'
const CONDENSED =
  '"Segoe UI", "Helvetica Neue", Arial, "Liberation Sans", sans-serif'

export const THEMES: Theme[] = [
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Fundo branco, tipografia sóbria, grade discreta. O padrão seguro.',
    background: '#FFFFFF',
    foreground: '#1A1D21',
    muted: '#6B7280',
    grid: '#E8EAED',
    axis: '#C7CBD1',
    mutedSeries: '#C9CDD3',
    fontFamily: SANS,
    titleFamily: SANS,
    titleSize: 21,
    titleWeight: 700,
    subtitleSize: 14,
    labelSize: 12,
    footerSize: 11,
    palette: EDITORIAL,
    sequential: SEQ_BLUE,
    diverging: DIV_RED_BLUE,
    accent: '#1A6BA8',
    rule: true,
  },
  {
    id: 'newsroom',
    name: 'Redação',
    description: 'Fundo rosado e azul-tinta, no espírito dos jornais de economia.',
    background: '#FFF1E5',
    foreground: '#33302E',
    muted: '#66605C',
    grid: '#E6D9CD',
    axis: '#CCC1B7',
    mutedSeries: '#CDBFB2',
    fontFamily: SANS,
    titleFamily: SERIF,
    titleSize: 23,
    titleWeight: 700,
    subtitleSize: 14,
    labelSize: 12,
    footerSize: 11,
    palette: NEWSROOM,
    sequential: SEQ_WARM,
    diverging: DIV_BROWN_TEAL,
    accent: '#0F5499',
    rule: true,
  },
  {
    id: 'nocturne',
    name: 'Noturno',
    description: 'Fundo escuro para telas, apresentações e dashboards.',
    background: '#14171C',
    foreground: '#F2F4F7',
    muted: '#98A2B3',
    grid: '#252A32',
    axis: '#3A4048',
    mutedSeries: '#454C56',
    fontFamily: SANS,
    titleFamily: SANS,
    titleSize: 21,
    titleWeight: 700,
    subtitleSize: 14,
    labelSize: 12,
    footerSize: 11,
    palette: NOCTURNE,
    sequential: SEQ_BLUE,
    diverging: DIV_RED_BLUE,
    accent: '#5AA9F0',
    rule: true,
  },
  {
    id: 'print',
    name: 'Impresso',
    description: 'Alto contraste e paleta acessível, calibrado para papel e slides.',
    background: '#FFFFFF',
    foreground: '#000000',
    muted: '#4A4A4A',
    grid: '#DCDCDC',
    axis: '#8A8A8A',
    mutedSeries: '#B4B4B4',
    fontFamily: CONDENSED,
    titleFamily: SERIF,
    titleSize: 22,
    titleWeight: 700,
    subtitleSize: 14,
    labelSize: 12,
    footerSize: 10,
    palette: ACCESSIBLE,
    sequential: SEQ_BLUE,
    diverging: DIV_RED_BLUE,
    accent: '#0072B2',
    rule: false,
  },
]

export const DEFAULT_THEME_ID = 'editorial'

export function getTheme(id: string, overrides?: Partial<ThemeTokens>): Theme {
  const base = THEMES.find((t) => t.id === id) ?? THEMES[0]
  if (!overrides || Object.keys(overrides).length === 0) return base
  return { ...base, ...overrides }
}

/**
 * Fundo para matemática de cor (halo, fade, mix). Quando o gráfico pede fundo
 * transparente, o desenho não pinta fundo — mas misturas de cor precisam de um
 * valor opaco; branco é o pressuposto razoável de onde o gráfico será embutido.
 */
export function backdropOf(theme: { background: string }): string {
  return theme.background === 'transparent' ? '#ffffff' : theme.background
}
