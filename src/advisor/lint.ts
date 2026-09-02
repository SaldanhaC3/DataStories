/**
 * Linter editorial.
 *
 * A tese da ferramenta é que o caminho fácil deve produzir o gráfico bem-feito.
 * O linter é a parte que cobra isso: não bloqueia nada, mas diz em voz alta o
 * que um editor diria antes de publicar. Cada regra abaixo vem de uma
 * convenção estabelecida de visualização, não de gosto pessoal — e cada uma
 * traz a razão junto, porque aviso sem motivo vira ruído que se aprende a
 * ignorar.
 */

import type { ChartSpec, Dataset, Theme } from '../core/types'
import { getChartDefinition } from '../core/render'
import { auditPalette, checkContrast } from '../core/theme/contrast'
import { categorical } from '../core/theme/palettes'
import { buildModel } from '../core/model'

export type Severity = 'erro' | 'aviso' | 'dica'

export interface LintIssue {
  id: string
  severity: Severity
  title: string
  detail: string
  /** Etapa do editor onde o problema se resolve. */
  step: 'dados' | 'grafico' | 'anotar' | 'publicar'
}

/**
 * O título conclui ou apenas rotula?
 *
 * Um título que conta algo quase sempre traz um verbo conjugado ou um número.
 * "Vendas por mês" não tem nenhum dos dois. A lista de verbos é explícita em
 * vez de morfológica de propósito: detectar conjugação em português por sufixo
 * gera falso positivo demais, e um linter que erra é um linter que se aprende
 * a ignorar — o que custaria justamente o que ele tem de útil.
 *
 * Por isso o aviso só dispara quando as três coisas valem: sem número, sem
 * verbo conhecido, e com forma de rótulo ("X por Y" ou começando por um
 * substantivo de catálogo).
 */
const CONCLUDING_VERBS =
  /\b(cai|caem|caiu|ca[íi]ram|cresce|crescem|cresceu|cresceram|sobe|sobem|subiu|subiram|desce|descem|desceu|desceram|dobra|dobram|dobrou|dobraram|triplica|triplicam|supera|superam|superou|superaram|ultrapassa|ultrapassam|ultrapassou|ultrapassaram|avan[çc]a|avan[çc]am|avan[çc]ou|avan[çc]aram|recua|recuam|recuou|recuaram|lidera|lideram|liderou|lideraram|perde|perdem|perdeu|perderam|ganha|ganham|ganhou|ganharam|chega|chegam|chegou|chegaram|atinge|atingem|atingiu|atingiram|reduz|reduzem|reduziu|reduziram|aumenta|aumentam|aumentou|aumentaram|encolhe|encolhem|encolheu|encolheram|responde|respondem|respondeu|responderam|puxa|puxam|puxou|puxaram|passa|passam|passou|passaram|parte|partem|partiu|partiram|segue|seguem|seguiu|seguiram|fica|ficam|ficou|ficaram|volta|voltam|voltou|voltaram|bate|batem|bateu|bateram|salta|saltam|saltou|saltaram|despenca|despencam|despencou|dispara|disparam|disparou|estagna|estagnam|concentra|concentram|representa|representam|domina|dominam|explica|explicam|mant[ée]m|manteve|[ée]|s[ãa]o|foi|foram|tem|t[êe]m|virou|viraram)\b/i

const LABEL_OPENERS =
  /^(evolu[çc][ãa]o|distribui[çc][ãa]o|comparativo|compara[çc][ãa]o|panorama|s[ée]rie|hist[óo]rico|total|n[úu]mero|quantidade|[íi]ndice|taxa|m[ée]dia|ranking|participa[çc][ãa]o|perfil|resumo|dados)\b/i

function titleLooksLikeLabel(title: string): boolean {
  const t = title.trim()
  if (t.length === 0) return false
  if (/\d/.test(t)) return false
  if (CONCLUDING_VERBS.test(t)) return false
  return LABEL_OPENERS.test(t) || /\bpor\b/i.test(t)
}

export function lintSpec(spec: ChartSpec, dataset: Dataset, theme: Theme): LintIssue[] {
  const issues: LintIssue[] = []
  const definition = getChartDefinition(spec.chart.type)
  const model = buildModel({ spec, dataset, theme })
  const seriesCount = model.series.length
  const categoryCount = model.categories.length

  const add = (issue: LintIssue) => issues.push(issue)

  // --- Dados -----------------------------------------------------------------
  if (dataset.rows.length === 0) {
    add({
      id: 'sem-dados',
      severity: 'erro',
      title: 'Nenhuma linha de dados',
      detail: 'Cole uma tabela, suba um CSV ou preencha a grade na etapa Dados.',
      step: 'dados',
    })
  }
  if (seriesCount === 0 && dataset.rows.length > 0) {
    add({
      id: 'sem-serie',
      severity: 'erro',
      title: 'Nenhuma coluna numérica em uso',
      detail:
        'O gráfico precisa de ao menos uma coluna de valores. Confira os tipos das colunas na etapa Dados.',
      step: 'dados',
    })
  }

  // --- Texto e crédito -------------------------------------------------------
  if (!spec.text.title.trim()) {
    add({
      id: 'sem-titulo',
      severity: 'aviso',
      title: 'O gráfico não tem título',
      detail:
        'O título é a primeira coisa lida e, muitas vezes, a única. Use-o para dizer a conclusão.',
      step: 'anotar',
    })
  } else if (titleLooksLikeLabel(spec.text.title)) {
    add({
      id: 'titulo-rotulo',
      severity: 'dica',
      title: 'O título descreve, mas não conclui',
      detail:
        'Troque "Vendas por mês" por "Vendas caem 23% desde julho". O leitor deve sair do título já sabendo o que os dados mostram.',
      step: 'anotar',
    })
  }

  if (!spec.text.source.trim()) {
    add({
      id: 'sem-fonte',
      severity: 'aviso',
      title: 'Sem fonte no rodapé',
      detail:
        'Todo gráfico publicado precisa dizer de onde vieram os números. É o que permite ao leitor verificar.',
      step: 'anotar',
    })
  }

  // --- Escala ----------------------------------------------------------------
  const isBarLike =
    spec.chart.type === 'bar' ||
    spec.chart.type === 'bar-horizontal' ||
    spec.chart.type === 'lollipop' ||
    spec.chart.type === 'histogram'

  if (isBarLike && spec.axes.y.min !== null && spec.axes.y.min > 0) {
    add({
      id: 'eixo-truncado',
      severity: 'erro',
      title: 'Barras com eixo cortado',
      detail:
        'Em barras a comparação é feita pelo comprimento. Começar acima do zero infla visualmente as diferenças. Remova o mínimo manual ou troque para linhas.',
      step: 'grafico',
    })
  }

  if (spec.axes.y.log && model.yDomain[0] <= 0) {
    add({
      id: 'log-invalido',
      severity: 'aviso',
      title: 'Escala logarítmica com valores não positivos',
      detail: 'O log foi ignorado porque há zeros ou negativos nos dados.',
      step: 'grafico',
    })
  }

  // --- Escolha do gráfico ----------------------------------------------------
  if (spec.chart.type === 'donut' && categoryCount > 4) {
    add({
      id: 'rosca-cheia',
      severity: 'aviso',
      title: `Rosca com ${categoryCount} fatias`,
      detail:
        'O olho compara ângulos mal. Acima de quatro partes, waffle ou barras horizontais são bem mais legíveis.',
      step: 'grafico',
    })
  }

  if (spec.chart.type === 'bar' && categoryCount > 12) {
    add({
      id: 'barras-verticais-demais',
      severity: 'dica',
      title: 'Muitas categorias em barras verticais',
      detail:
        'Com esse número de categorias os rótulos ficam apertados. Barras horizontais dão espaço para o nome inteiro.',
      step: 'grafico',
    })
  }

  if (spec.chart.type === 'scatter' && dataset.rows.length < 8) {
    add({
      id: 'dispersao-rala',
      severity: 'dica',
      title: 'Poucos pontos para uma dispersão',
      detail: 'Com menos de oito observações não há padrão para o leitor enxergar.',
      step: 'grafico',
    })
  }

  if (spec.chart.options.stack === 'stacked' && seriesCount > 5) {
    add({
      id: 'empilhamento-fundo',
      severity: 'dica',
      title: 'Empilhamento com muitas séries',
      detail:
        'Só a fatia de baixo tem uma base reta; as de cima ficam difíceis de comparar entre si. Considere linhas ou pequenos múltiplos.',
      step: 'grafico',
    })
  }

  // --- Cor e ênfase ----------------------------------------------------------
  // Mapa de calor fica de fora: lá "muitas colunas" é a natureza da matriz, e
  // a cor já codifica valor — o conselho de destacar séries não se aplicaria.
  if (seriesCount > 6 && spec.chart.type !== 'heatmap' && spec.highlight.series.length === 0) {
    add({
      id: 'cores-demais',
      severity: 'aviso',
      title: `${seriesCount} séries coloridas ao mesmo tempo`,
      detail:
        'Acima de seis cores o leitor perde a conta. Destaque uma ou duas séries na etapa Anotar e deixe o resto em cinza — a história aparece.',
      step: 'anotar',
    })
  }

  if (seriesCount > 1) {
    const palette = categorical(theme.palette, seriesCount)
    const audit = auditPalette(palette.slice(0, seriesCount), theme.background)
    if (audit.collisions.length > 0) {
      const first = audit.collisions[0]
      add({
        id: 'daltonismo',
        severity: 'aviso',
        title: 'Duas cores se confundem para leitores daltônicos',
        detail: `${first.a} e ${first.b} ficam praticamente idênticas em ${first.kind}. Reduza o número de séries, use destaque ou troque a paleta.`,
        step: 'grafico',
      })
    }
    if (audit.lowContrast.length > 0) {
      add({
        id: 'contraste-marca',
        severity: 'dica',
        title: 'Cor de série com pouco contraste contra o fundo',
        detail: `${audit.lowContrast[0].color} fica em ${audit.lowContrast[0].ratio.toFixed(1)}:1 — linhas finas nessa cor somem.`,
        step: 'grafico',
      })
    }
  }

  const textContrast = checkContrast(theme.foreground, theme.background)
  if (!textContrast.aa) {
    add({
      id: 'contraste-texto',
      severity: 'aviso',
      title: 'Texto com contraste abaixo do mínimo',
      detail: `A razão atual é ${textContrast.ratio.toFixed(1)}:1; a WCAG AA pede 4,5:1 para texto normal.`,
      step: 'grafico',
    })
  }

  // --- Rótulos ---------------------------------------------------------------
  if (
    definition.supportsDirectLabels &&
    !spec.labels.directLabels &&
    seriesCount > 1 &&
    seriesCount <= 8
  ) {
    add({
      id: 'prefira-rotulo-direto',
      severity: 'dica',
      title: 'Legenda em vez de rótulo direto',
      detail:
        'Com até oito séries, o rótulo colado na ponta da linha poupa o leitor de ir e voltar até a legenda.',
      step: 'anotar',
    })
  }

  if (spec.labels.valueLabels && categoryCount * seriesCount > 40) {
    add({
      id: 'rotulos-demais',
      severity: 'dica',
      title: 'Rótulos de valor em marcas demais',
      detail:
        'São mais de quarenta números sobre o gráfico. Se cada valor importa, uma tabela comunica melhor.',
      step: 'anotar',
    })
  }

  // --- Anotação --------------------------------------------------------------
  if (spec.annotations.length === 0 && spec.highlight.series.length === 0 && spec.highlight.categories.length === 0) {
    add({
      id: 'sem-narrativa',
      severity: 'dica',
      title: 'O gráfico ainda não aponta nada',
      detail:
        'Destacar uma série ou colocar uma anotação onde algo aconteceu é o que separa um gráfico que informa de um que apenas exibe.',
      step: 'anotar',
    })
  }

  for (const annotation of spec.annotations) {
    if (annotation.kind === 'text' && !annotation.text.trim()) {
      add({
        id: `anotacao-vazia-${annotation.id}`,
        severity: 'aviso',
        title: 'Anotação de texto vazia',
        detail: 'Ela ocupa espaço no arquivo e não aparece no gráfico.',
        step: 'anotar',
      })
    }
  }

  const order: Record<Severity, number> = { erro: 0, aviso: 1, dica: 2 }
  return issues.sort((a, b) => order[a.severity] - order[b.severity])
}
