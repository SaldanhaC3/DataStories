/**
 * Exemplos embutidos.
 *
 * Servem a dois propósitos: dar um ponto de partida em um clique e mostrar,
 * na prática, o que "gráfico com storytelling" quer dizer nesta ferramenta —
 * título que conclui, uma série em destaque, uma anotação onde algo aconteceu,
 * fonte no rodapé.
 *
 * Os números são inventados para demonstração. Isso está dito no rodapé de
 * cada exemplo, e não por formalidade: um gráfico que não diz de onde vieram
 * os dados é exatamente o que esta ferramenta existe para desencorajar.
 */

import type { ChartSpec } from '../core/types'
import { createDefaultSpec, newId } from '../core/schema'
import { parseDelimited } from '../core/dataset/parse'

export interface Example {
  id: string
  name: string
  description: string
  build: () => ChartSpec
}

function make(csv: string, patch: (spec: ChartSpec) => void): ChartSpec {
  const spec = createDefaultSpec()
  spec.data = parseDelimited(csv)
  patch(spec)
  return spec
}

const RECEITA = `Mês;Assinaturas;Avulso
2024-01;412;188
2024-02;438;192
2024-03;455;181
2024-04;489;174
2024-05;521;169
2024-06;544;158
2024-07;562;151
2024-08;601;139
2024-09;658;131
2024-10;712;124
2024-11;790;118
2024-12;884;112`

const REGIOES = `Região;Cobertura
Sudeste;87,4
Sul;84,1
Centro-Oeste;79,6
Nordeste;71,2
Norte;63,8`

const ANTES_DEPOIS = `Cidade;2019;2024
Belém;58,2;71,4
Manaus;61,5;70,8
Recife;66,1;74,2
Salvador;68,9;75,1
Fortaleza;70,3;78,4
Goiânia;74,6;81,3
Curitiba;81,2;86,5
Porto Alegre;83,4;85,1`

const MATRIZ = `Fonte;Participação
Hidrelétrica;46
Eólica;21
Solar;13
Biomassa;9
Gás natural;7
Outras;4`

export const EXAMPLES: Example[] = [
  {
    id: 'receita',
    name: 'Receita por canal',
    description: 'Linha com destaque de série, anotação e rótulo direto.',
    build: () =>
      make(RECEITA, (spec) => {
        spec.chart.type = 'line'
        spec.chart.options.curve = 'smooth'
        spec.chart.options.strokeWidth = 2.6
        spec.encoding.x = 'Mês'
        spec.encoding.y = ['Assinaturas', 'Avulso']
        spec.highlight.series = ['Assinaturas']
        spec.labels.directLabels = true
        spec.text = {
          title: 'Assinaturas dobram no ano enquanto o avulso encolhe 40%',
          subtitle: 'Receita mensal por canal, em milhares de reais',
          source: 'dados fictícios, gerados para demonstração',
          sourceUrl: '',
          note: '',
          credit: 'DataStories',
        }
        spec.annotations = [
          {
            id: newId(),
            kind: 'text',
            text: 'A partir daqui a assinatura passa a sustentar sozinha o crescimento.',
            x: 0.58,
            y: 0.12,
            align: 'left',
            size: 13,
            bold: false,
            color: null,
            background: true,
            connector: { enabled: true, tx: 0.82, ty: 0.3, arrow: true },
          },
          {
            id: newId(),
            kind: 'line',
            axis: 'y',
            value: '500',
            label: 'meta do ano',
            dash: true,
            color: null,
          },
        ]
        spec.layout = { width: 760, height: 470 }
      }),
  },
  {
    id: 'regioes',
    name: 'Ranking por região',
    description: 'Barras horizontais ordenadas, com destaque e rótulo de valor.',
    build: () =>
      make(REGIOES, (spec) => {
        spec.chart.type = 'bar-horizontal'
        spec.encoding.x = 'Região'
        spec.encoding.y = ['Cobertura']
        spec.transform.sortBy = 'Cobertura'
        spec.transform.sortDirection = 'desc'
        spec.highlight.series = []
        spec.labels.valueLabels = true
        spec.labels.legend = 'off'
        spec.axes.y.unit = '%'
        spec.color.kind = 'single'
        spec.text = {
          title: 'Norte tem a menor cobertura do país, 24 pontos abaixo do Sudeste',
          subtitle: 'Cobertura do serviço, em % da população, 2024',
          source: 'dados fictícios, gerados para demonstração',
          sourceUrl: '',
          note: '',
          credit: 'DataStories',
        }
        spec.annotations = [
          {
            id: newId(),
            kind: 'line',
            axis: 'y',
            value: '77,2',
            label: 'média nacional',
            dash: true,
            color: null,
          },
        ]
        spec.layout = { width: 720, height: 420 }
      }),
  },
  {
    id: 'antes-depois',
    name: 'Antes e depois',
    description: 'Haltere: mostra a diferença entre dois momentos, não só os níveis.',
    build: () =>
      make(ANTES_DEPOIS, (spec) => {
        spec.chart.type = 'dumbbell'
        spec.encoding.x = 'Cidade'
        spec.encoding.y = ['2019', '2024']
        spec.transform.sortBy = '2024'
        spec.transform.sortDirection = 'asc'
        spec.labels.valueLabels = true
        spec.labels.legend = 'top'
        spec.axes.y.unit = '%'
        spec.text = {
          title: 'Cidades que partiram de baixo avançaram mais em cinco anos',
          subtitle: 'Indicador de cobertura em 2019 e 2024, em %',
          source: 'dados fictícios, gerados para demonstração',
          sourceUrl: '',
          note: 'A ordem segue o valor de 2024.',
          credit: 'DataStories',
        }
        spec.layout = { width: 740, height: 480 }
      }),
  },
  {
    id: 'matriz',
    name: 'Composição',
    description: 'Waffle: proporção em células contáveis, sem a distorção da pizza.',
    build: () =>
      make(MATRIZ, (spec) => {
        spec.chart.type = 'waffle'
        spec.encoding.x = 'Fonte'
        spec.encoding.y = ['Participação']
        spec.highlight.categories = ['Eólica', 'Solar']
        spec.text = {
          title: 'Eólica e solar já respondem por um terço da geração',
          subtitle: 'Participação de cada fonte na geração, em %',
          source: 'dados fictícios, gerados para demonstração',
          sourceUrl: '',
          note: 'Cada quadrado equivale a 1% da geração.',
          credit: 'DataStories',
        }
        spec.theme.id = 'newsroom'
        spec.layout = { width: 700, height: 480 }
      }),
  },
]
