/**
 * Galeria de desenvolvimento (`/gallery.html`).
 *
 * Renderiza todos os exemplos e todos os tipos de gráfico sobre o mesmo
 * conjunto de dados, em tamanho natural e lado a lado. É a folha de prova
 * visual do projeto: qualquer regressão de layout — rótulo cortado, margem
 * errada, colisão de texto — aparece aqui antes de aparecer para o usuário.
 *
 * Não faz parte do editor e não entra no bundle da aplicação.
 */

import { createRoot } from 'react-dom/client'
import type { ChartSpec, ChartType } from '../core/types'
import { allChartDefinitions, renderChart } from '../core/render'
import { getTheme, THEMES } from '../core/theme/themes'
import { deriveDataset } from '../core/dataset/transform'
import { parseDelimited } from '../core/dataset/parse'
import { createDefaultSpec } from '../core/schema'
import { EXAMPLES } from '../examples/samples'
import { Canvas } from '../ui/Canvas'
import '../ui/styles.css'

const DEMO = `Região;2019;2024;Meta
Sudeste;58,2;71,4;80
Sul;61,5;70,8;80
Centro-Oeste;66,1;74,2;80
Nordeste;68,9;75,1;80
Norte;70,3;78,4;80
Distrito Federal;74,6;81,3;80`

const SPREAD = `Amostra;Grupo A;Grupo B
1;12,4;22,1
2;15,1;19,8
3;11,8;25,4
4;18,2;21,0
5;14,6;28,9
6;13,3;20,2
7;16,9;24,7
8;12,1;30,5
9;19,4;18,9
10;15,8;23,3
11;14,2;26,1
12;17,5;21,8
13;13,9;29,4
14;16,1;22,6
15;12,8;27,0
16;20,3;19,4
17;15,4;24,1
18;14,8;25,8
19;18,7;20,9
20;13,6;31,2`

function specFor(type: ChartType, csv: string, patch?: (s: ChartSpec) => void): ChartSpec {
  const spec = createDefaultSpec()
  spec.data = parseDelimited(csv)
  spec.chart.type = type
  spec.layout = { width: 620, height: 420 }
  spec.text.title = allChartDefinitions().find((d) => d.type === type)?.label ?? type
  spec.text.subtitle = allChartDefinitions().find((d) => d.type === type)?.hint ?? ''
  spec.text.source = 'dados fictícios'
  patch?.(spec)
  return spec
}

function Plate({ spec }: { spec: ChartSpec }) {
  const dataset = deriveDataset(spec.data, spec.transform)
  const theme = getTheme(spec.theme.id, spec.theme.overrides)
  try {
    const scene = renderChart({ spec, dataset, theme })
    return <Canvas scene={scene} spec={spec} interactive={false} />
  } catch (error) {
    return (
      <div className="empty" style={{ width: spec.layout.width }}>
        {String(error)}
      </div>
    )
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ font: '700 13px/1 var(--font)', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted-soft)' }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 14 }}>{children}</div>
    </section>
  )
}

/** Cada tipo recebe os dados que fazem sentido para ele. */
function specsForAllTypes(): ChartSpec[] {
  return allChartDefinitions().map((definition) => {
    switch (definition.type) {
      case 'histogram':
      case 'boxplot':
        return specFor(definition.type, SPREAD, (spec) => {
          spec.encoding.x = 'Amostra'
          spec.encoding.y = ['Grupo A', 'Grupo B']
        })
      case 'donut':
      case 'waffle':
      case 'treemap':
        return specFor(definition.type, DEMO, (spec) => {
          spec.encoding.x = 'Região'
          spec.encoding.y = ['2024']
        })
      case 'bullet':
        return specFor(definition.type, DEMO, (spec) => {
          spec.encoding.x = 'Região'
          spec.encoding.y = ['2024']
          spec.encoding.target = 'Meta'
        })
      case 'scatter':
        return specFor(definition.type, DEMO, (spec) => {
          spec.encoding.x = '2019'
          spec.encoding.y = ['2024']
        })
      default:
        return specFor(definition.type, DEMO, (spec) => {
          spec.encoding.x = 'Região'
          spec.encoding.y = ['2019', '2024']
        })
    }
  })
}

/**
 * `?type=slope` mostra um unico grafico, em pagina curta. Existe porque
 * inspecionar um grafico especifico numa pagina de seis mil pixels e
 * desnecessariamente dificil.
 */
function Single({ type }: { type: ChartType }) {
  const spec = specsForAllTypes().find((s) => s.chart.type === type)
  return (
    <div style={{ padding: 28, background: 'var(--bg)' }}>
      {spec ? <Plate spec={spec} /> : <div className="empty">Tipo desconhecido: {type}</div>}
    </div>
  )
}

function Example({ id }: { id: string }) {
  const example = EXAMPLES.find((e) => e.id === id)
  return (
    <div style={{ padding: 28, background: 'var(--bg)' }}>
      {example ? <Plate spec={example.build()} /> : <div className="empty">Exemplo desconhecido</div>}
    </div>
  )
}

function Gallery() {
  return (
    <div style={{ padding: 28, background: 'var(--bg)', minHeight: '100vh' }}>
      <h1 style={{ font: '700 20px/1.2 var(--font)', marginBottom: 6 }}>
        Galeria de referência
      </h1>
      <p style={{ font: '13px/1.5 var(--font)', color: 'var(--muted)', marginTop: 0, marginBottom: 30 }}>
        Todos os tipos e temas com os mesmos dados. Use como conferência visual antes de publicar
        mudanças no núcleo de desenho.
      </p>

      <Section title="Exemplos embutidos">
        {EXAMPLES.map((example) => (
          <Plate key={example.id} spec={example.build()} />
        ))}
      </Section>

      <Section title="Todos os tipos">
        {specsForAllTypes().map((spec) => (
          <Plate key={spec.chart.type} spec={spec} />
        ))}
      </Section>

      <Section title="Temas">
        {THEMES.map((theme) => (
          <Plate
            key={theme.id}
            spec={specFor('line', DEMO, (spec) => {
              spec.encoding.x = 'Região'
              spec.encoding.y = ['2019', '2024']
              spec.theme.id = theme.id
              spec.text.title = theme.name
              spec.text.subtitle = theme.description
              spec.highlight.series = ['2024']
            })}
          />
        ))}
      </Section>
    </div>
  )
}

const params = new URLSearchParams(location.search)
const single = params.get('type')
const example = params.get('example')

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    single ? (
      <Single type={single as ChartType} />
    ) : example ? (
      <Example id={example} />
    ) : (
      <Gallery />
    ),
  )
}
