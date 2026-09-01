/**
 * Testes do núcleo de desenho.
 *
 * Não comparam pixels — comparam invariantes. Um gráfico pode mudar de
 * aparência sem estar errado; o que não pode é somar mal, cortar o eixo de
 * barras sem aviso, ou emitir coordenadas inválidas no SVG.
 */

import { describe, expect, it } from 'vitest'
import type { ChartSpec, ChartType } from '../src/core/types'
import { createDefaultSpec, parseSpec, serializeSpec } from '../src/core/schema'
import { parseDelimited } from '../src/core/dataset/parse'
import { deriveDataset } from '../src/core/dataset/transform'
import { buildModel } from '../src/core/model'
import { allChartDefinitions, renderChart } from '../src/core/render'
import { getTheme } from '../src/core/theme/themes'
import { sceneToSvg } from '../src/core/export/svg'
import { resolveVerticalCollisions } from '../src/core/annotate/collision'
import { auditPalette, checkContrast, contrastRatio, simulateColorVision } from '../src/core/theme/contrast'
import { THEMES } from '../src/core/theme/themes'
import { lintSpec } from '../src/advisor/lint'

const CSV = `Região;2019;2024
Norte;58,2;71,4
Nordeste;61,5;70,8
Centro-Oeste;66,1;74,2
Sudeste;68,9;75,1
Sul;74,6;81,3`

function makeSpec(type: ChartType, patch?: (s: ChartSpec) => void): ChartSpec {
  const spec = createDefaultSpec()
  spec.data = parseDelimited(CSV)
  spec.chart.type = type
  spec.encoding.x = 'Região'
  spec.encoding.y = ['2019', '2024']
  spec.text.title = 'Título de teste'
  spec.text.source = 'teste'
  patch?.(spec)
  return spec
}

function render(spec: ChartSpec) {
  const dataset = deriveDataset(spec.data, spec.transform)
  const theme = getTheme(spec.theme.id, spec.theme.overrides)
  return renderChart({ spec, dataset, theme })
}

describe('renderChart', () => {
  it.each(allChartDefinitions().map((d) => d.type))(
    'desenha %s sem lançar e com nós de sobra',
    (type) => {
      const scene = render(makeSpec(type))
      expect(scene.nodes.length).toBeGreaterThan(3)
      expect(scene.plot.width).toBeGreaterThan(0)
      expect(scene.plot.height).toBeGreaterThan(0)
    },
  )

  it.each(allChartDefinitions().map((d) => d.type))(
    'gera SVG válido para %s, sem NaN nem undefined',
    (type) => {
      const svg = sceneToSvg(render(makeSpec(type)))
      expect(svg).toContain('<svg')
      expect(svg).not.toContain('NaN')
      expect(svg).not.toContain('undefined')
      expect(svg).not.toContain('Infinity')
    },
  )

  it('aguenta tabela vazia sem quebrar', () => {
    const spec = createDefaultSpec()
    expect(() => render(spec)).not.toThrow()
  })

  it('aguenta lacunas nos dados', () => {
    const spec = makeSpec('line')
    spec.data = parseDelimited('Mês;A\n2024-01;10\n2024-02;\n2024-03;30')
    spec.encoding = { ...spec.encoding, x: 'Mês', y: ['A'] }
    expect(() => render(spec)).not.toThrow()
  })
})

describe('domínio do eixo de valores', () => {
  it('força o zero em barras, porque a leitura é por comprimento', () => {
    const model = modelOf(makeSpec('bar'))
    expect(model.yDomain[0]).toBe(0)
  })

  it('não força o zero em linhas, onde a leitura é por posição', () => {
    // Regressão: a base implícita de zero das séries não empilhadas entrava no
    // domínio e achatava todo gráfico de linha contra o topo.
    const model = modelOf(makeSpec('line'))
    expect(model.yDomain[0]).toBeGreaterThan(50)
  })

  it('respeita limites manuais', () => {
    const model = modelOf(
      makeSpec('line', (spec) => {
        spec.axes.y.min = 0
        spec.axes.y.max = 200
      }),
    )
    expect(model.yDomain).toEqual([0, 200])
  })
})

function modelOf(spec: ChartSpec) {
  const dataset = deriveDataset(spec.data, spec.transform)
  return buildModel({ spec, dataset, theme: getTheme(spec.theme.id) })
}

describe('empilhamento', () => {
  it('acumula as bases na ordem das séries', () => {
    const model = modelOf(
      makeSpec('bar', (spec) => {
        spec.chart.options.stack = 'stacked'
      }),
    )
    expect(model.series[0].bases?.[0]).toBe(0)
    expect(model.series[1].bases?.[0]).toBeCloseTo(58.2, 5)
  })

  it('normaliza para 100%', () => {
    const model = modelOf(
      makeSpec('bar', (spec) => {
        spec.chart.options.stack = 'stacked100'
      }),
    )
    const total = model.series.reduce((sum, s) => sum + (s.values[0] ?? 0), 0)
    expect(total).toBeCloseTo(100, 5)
  })
})

describe('destaque', () => {
  it('apaga as séries não destacadas', () => {
    const model = modelOf(
      makeSpec('line', (spec) => {
        spec.highlight.series = ['2024']
      }),
    )
    expect(model.series.find((s) => s.name === '2024')?.muted).toBe(false)
    expect(model.series.find((s) => s.name === '2019')?.muted).toBe(true)
  })
})

describe('anticolisão de rótulos', () => {
  it('separa rótulos sobrepostos preservando a ordem', () => {
    const slots = [100, 104, 108, 200].map((target) => ({ target, height: 14, y: target }))
    resolveVerticalCollisions(slots, { top: 0, bottom: 400 }, 2)

    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].y).toBeGreaterThan(slots[i - 1].y)
      expect(slots[i].y - slots[i - 1].y).toBeGreaterThanOrEqual(14)
    }
  })

  it('mantém os rótulos dentro dos limites', () => {
    const slots = Array.from({ length: 8 }, () => ({ target: 10, height: 14, y: 10 }))
    resolveVerticalCollisions(slots, { top: 0, bottom: 200 }, 2)
    for (const slot of slots) {
      expect(slot.y).toBeGreaterThanOrEqual(-1)
      expect(slot.y).toBeLessThanOrEqual(201)
    }
  })
})

describe('acessibilidade de cor', () => {
  it('calcula a razão de contraste da WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })

  it.each(THEMES.map((t) => [t.name, t] as const))(
    'tema %s tem texto legível sobre o próprio fundo',
    (_name, theme) => {
      expect(checkContrast(theme.foreground, theme.background).aa).toBe(true)
      // Texto secundário só precisa passar no critério de texto grande.
      expect(checkContrast(theme.muted, theme.background).aaLarge).toBe(true)
    },
  )

  it.each(THEMES.map((t) => [t.name, t] as const))(
    'as tres primeiras cores do tema %s se distinguem nas tres deficiencias',
    (_name, theme) => {
      const audit = auditPalette(theme.palette.slice(0, 3), theme.background, {
        redGreen: 9.5,
        tritan: 9.5,
      })
      expect(audit.collisions).toEqual([])
    },
  )

  it.each(THEMES.map((t) => [t.name, t] as const))(
    'as quatro primeiras cores do tema %s resistem a protanopia e deuteranopia',
    (_name, theme) => {
      // Tritanopia sai da conta a partir da quarta cor: nenhuma paleta
      // categorica de oito cores a satisfaz, e sua prevalencia e mil vezes
      // menor. O linter cobra o destaque em vez de prometer o impossivel.
      const audit = auditPalette(theme.palette.slice(0, 4), theme.background, {
        redGreen: 8.5,
        tritan: 0,
      })
      expect(audit.collisions).toEqual([])
    },
  )

  it.each(THEMES.map((t) => [t.name, t] as const))(
    'toda cor do tema %s alcanca 3:1 contra o proprio fundo',
    (_name, theme) => {
      expect(auditPalette(theme.palette, theme.background, 0).lowContrast).toEqual([])
    },
  )

  it('a simulação de daltonismo é determinística e devolve cor válida', () => {
    const a = simulateColorVision('#e2603b', 'deuteranopia')
    const b = simulateColorVision('#e2603b', 'deuteranopia')
    expect(a).toBe(b)
    expect(a).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('documento', () => {
  it('faz ida e volta pelo JSON sem alterar a cena', () => {
    const spec = makeSpec('line', (s) => {
      s.highlight.series = ['2024']
      s.annotations = [
        {
          id: 'a1',
          kind: 'text',
          text: 'nota',
          x: 0.4,
          y: 0.3,
          align: 'left',
          size: 13,
          bold: false,
          color: null,
          background: true,
          connector: { enabled: true, tx: 0.6, ty: 0.5, arrow: true },
        },
      ]
    })

    const result = parseSpec(serializeSpec(spec))
    expect(result.ok).toBe(true)
    expect(sceneToSvg(render(result.spec!))).toBe(sceneToSvg(render(spec)))
  })

  it('preenche o que falta com o padrão, para arquivos antigos continuarem abrindo', () => {
    const result = parseSpec('{"specVersion":1}')
    expect(result.ok).toBe(true)
    expect(result.spec?.chart.type).toBe('bar')
    expect(result.spec?.labels.directLabels).toBe(true)
  })

  it('recusa JSON inválido com uma mensagem, em vez de lançar', () => {
    expect(parseSpec('{').ok).toBe(false)
    expect(parseSpec('{').error).toBeTruthy()
  })
})

describe('linter editorial', () => {
  const lintOf = (spec: ChartSpec) =>
    lintSpec(spec, deriveDataset(spec.data, spec.transform), getTheme(spec.theme.id))

  const ids = (spec: ChartSpec) => lintOf(spec).map((i) => i.id)

  it('reclama de eixo cortado em barras', () => {
    expect(
      ids(
        makeSpec('bar', (s) => {
          s.axes.y.min = 50
        }),
      ),
    ).toContain('eixo-truncado')
  })

  it('reclama de rosca com fatias demais', () => {
    expect(ids(makeSpec('donut'))).toContain('rosca-cheia')
  })

  it('cobra a fonte no rodapé', () => {
    expect(
      ids(
        makeSpec('bar', (s) => {
          s.text.source = ''
        }),
      ),
    ).toContain('sem-fonte')
  })

  it('distingue título-rótulo de título-conclusão', () => {
    expect(ids(makeSpec('bar', (s) => (s.text.title = 'Vendas por mês')))).toContain(
      'titulo-rotulo',
    )
    expect(ids(makeSpec('bar', (s) => (s.text.title = 'Vendas caem 23% desde julho')))).not.toContain(
      'titulo-rotulo',
    )
    // Verbo no plural também conta como conclusão.
    expect(
      ids(makeSpec('bar', (s) => (s.text.title = 'Eólica e solar já respondem por um terço'))),
    ).not.toContain('titulo-rotulo')
  })

  it('não inventa problema num gráfico bem-feito', () => {
    const spec = makeSpec('bar-horizontal', (s) => {
      s.text.title = 'Sul lidera a cobertura entre as regiões'
      s.text.source = 'IBGE'
      s.highlight.categories = ['Sul']
      s.encoding.y = ['2024']
    })
    expect(lintOf(spec).filter((i) => i.severity !== 'dica')).toEqual([])
  })
})
