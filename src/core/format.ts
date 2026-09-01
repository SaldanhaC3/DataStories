/**
 * Formatação de números e datas.
 *
 * Nada aqui usa `toLocaleString` do navegador: o resultado precisa ser idêntico
 * no editor, no PNG exportado e no embed, inclusive quando o embed roda numa
 * máquina com outro locale de sistema. Por isso os locales são declarados.
 */

import { formatLocale, type FormatLocaleDefinition } from 'd3-format'
import { timeFormatLocale, type TimeLocaleDefinition } from 'd3-time-format'

export type LocaleId = 'pt-BR' | 'en-US'

const PT_BR_NUMBER: FormatLocaleDefinition = {
  decimal: ',',
  thousands: '.',
  grouping: [3],
  currency: ['R$ ', ''],
  minus: '−',
}

const EN_US_NUMBER: FormatLocaleDefinition = {
  decimal: '.',
  thousands: ',',
  grouping: [3],
  currency: ['$', ''],
  minus: '−',
}

const PT_BR_TIME: TimeLocaleDefinition = {
  dateTime: '%A, %e de %B de %Y. %X',
  date: '%d/%m/%Y',
  time: '%H:%M:%S',
  periods: ['AM', 'PM'],
  days: [
    'domingo',
    'segunda-feira',
    'terça-feira',
    'quarta-feira',
    'quinta-feira',
    'sexta-feira',
    'sábado',
  ],
  shortDays: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  months: [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ],
  shortMonths: [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ],
}

const EN_US_TIME: TimeLocaleDefinition = {
  dateTime: '%x, %X',
  date: '%-m/%-d/%Y',
  time: '%-I:%M:%S %p',
  periods: ['AM', 'PM'],
  days: [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ],
  shortDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  shortMonths: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
}

const numberLocales = {
  'pt-BR': formatLocale(PT_BR_NUMBER),
  'en-US': formatLocale(EN_US_NUMBER),
}

const timeLocales = {
  'pt-BR': timeFormatLocale(PT_BR_TIME),
  'en-US': timeFormatLocale(EN_US_TIME),
}

const ABBREVIATIONS: Record<LocaleId, Array<[number, string]>> = {
  'pt-BR': [
    [1e12, ' tri'],
    [1e9, ' bi'],
    [1e6, ' mi'],
    [1e3, ' mil'],
  ],
  'en-US': [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ],
}

/** Aplica um especificador d3-format no locale pedido. */
export function formatNumber(
  value: number,
  spec: string | null,
  locale: LocaleId = 'pt-BR',
): string {
  if (!Number.isFinite(value)) return '—'
  const fmt = numberLocales[locale].format(spec ?? ',')
  return fmt(value)
}

/**
 * Números curtos para eixos e rótulos: 1.500 vira "1,5 mil".
 * Mantém o sinal e nunca inventa precisão que o valor não tem.
 */
export function abbreviate(
  value: number,
  locale: LocaleId = 'pt-BR',
  maxDecimals = 1,
): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)

  for (const [threshold, suffix] of ABBREVIATIONS[locale]) {
    if (abs >= threshold) {
      const scaled = value / threshold
      const decimals = Math.abs(scaled) >= 100 ? 0 : maxDecimals
      const rounded = Number(scaled.toFixed(decimals))
      return formatNumber(rounded, `,.${Number.isInteger(rounded) ? 0 : decimals}f`, locale) + suffix
    }
  }

  if (Number.isInteger(value)) return formatNumber(value, ',', locale)
  return formatNumber(value, ',.2~f', locale)
}

export function formatDate(
  ms: number,
  pattern: string,
  locale: LocaleId = 'pt-BR',
): string {
  return timeLocales[locale].format(pattern)(new Date(ms))
}

/**
 * Escolhe um padrão de data adequado à amplitude do domínio.
 * Mais de 3 anos: só o ano. Meses: mês abreviado. Dias: dia/mês.
 */
export function autoDatePattern(spanMs: number): string {
  const DAY = 86_400_000
  if (spanMs > 1095 * DAY) return '%Y'
  if (spanMs > 120 * DAY) return "%b/%y"
  if (spanMs > 3 * DAY) return '%d/%b'
  if (spanMs > 2 * 3_600_000) return '%d/%b %Hh'
  return '%H:%M'
}

/**
 * Escolhe um formato numérico a partir da amplitude dos ticks.
 * Valores grandes são abreviados; frações ganham as casas necessárias
 * para que dois ticks vizinhos não apareçam iguais.
 */
export function autoNumberFormatter(
  ticks: number[],
  locale: LocaleId = 'pt-BR',
): (v: number) => string {
  const finite = ticks.filter((t) => Number.isFinite(t))
  if (finite.length === 0) return (v) => formatNumber(v, null, locale)

  const maxAbs = Math.max(...finite.map(Math.abs))
  if (maxAbs >= 10_000) return (v) => abbreviate(v, locale)

  const step =
    finite.length > 1 ? Math.abs(finite[1] - finite[0]) : Math.abs(finite[0] || 1)
  if (step === 0 || !Number.isFinite(step)) {
    return (v) => formatNumber(v, ',', locale)
  }

  const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 0))
  return (v) => formatNumber(v, `,.${decimals}f`, locale)
}

/** Trunca preservando palavras, para rótulos que não cabem. */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}
