/**
 * Testes de entrada de dados.
 *
 * É onde uma ferramenta brasileira de gráficos mais erra: separador decimal,
 * formato de data e detecção de cabeçalho. Cada caso aqui corresponde a uma
 * tabela que alguém realmente cola.
 */

import { describe, expect, it } from 'vitest'
import { detectDelimiter, detectLocale, parseDelimited, toCSV } from '../src/core/dataset/parse'
import { inferColumnType, parseDate, parseNumber } from '../src/core/dataset/infer'
import { deriveDataset, pivotLongToWide, transposeSource } from '../src/core/dataset/transform'
import { DEFAULT_TRANSFORM } from '../src/core/dataset/transform'

describe('parseNumber', () => {
  it('lê o formato brasileiro', () => {
    expect(parseNumber('1.234,56', 'pt-BR')).toBe(1234.56)
    expect(parseNumber('1.234.567', 'pt-BR')).toBe(1234567)
    expect(parseNumber('0,5', 'pt-BR')).toBe(0.5)
    expect(parseNumber('R$ 1.999,90', 'pt-BR')).toBe(1999.9)
    expect(parseNumber('45%', 'pt-BR')).toBe(45)
  })

  it('lê o formato americano', () => {
    expect(parseNumber('1,234.56', 'en-US')).toBe(1234.56)
    expect(parseNumber('1234', 'en-US')).toBe(1234)
  })

  it('trata parênteses como negativo, na convenção contábil', () => {
    expect(parseNumber('(1.234)', 'pt-BR')).toBe(-1234)
  })

  it('devolve null para o que não é número', () => {
    expect(parseNumber('', 'pt-BR')).toBeNull()
    expect(parseNumber('—', 'pt-BR')).toBeNull()
    expect(parseNumber('Norte', 'pt-BR')).toBeNull()
    expect(parseNumber('12/2024', 'pt-BR')).toBeNull()
  })
})

describe('parseDate', () => {
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10))

  it('lê ISO', () => {
    expect(iso(parseDate('2024-03-15', 'pt-BR'))).toBe('2024-03-15')
    expect(iso(parseDate('2024-03', 'pt-BR'))).toBe('2024-03-01')
  })

  it('lê dia/mês/ano no padrão brasileiro e mês/dia/ano no americano', () => {
    expect(iso(parseDate('03/04/2024', 'pt-BR'))).toBe('2024-04-03')
    expect(iso(parseDate('03/04/2024', 'en-US'))).toBe('2024-03-04')
  })

  it('lê mês/ano, trimestre e nome de mês', () => {
    expect(iso(parseDate('03/2024', 'pt-BR'))).toBe('2024-03-01')
    expect(iso(parseDate('2024-Q2', 'pt-BR'))).toBe('2024-04-01')
    expect(iso(parseDate('mar/2024', 'pt-BR'))).toBe('2024-03-01')
    expect(iso(parseDate('15 de março de 2024', 'pt-BR'))).toBe('2024-03-15')
  })

  it('rejeita mês inválido', () => {
    expect(parseDate('15/13/2024', 'pt-BR')).toBeNull()
  })
})

describe('inferColumnType', () => {
  it('prefere número para anos soltos, que rendem eixo mais limpo', () => {
    expect(inferColumnType(['2019', '2020', '2021'], 'pt-BR')).toBe('number')
  })

  it('reconhece datas quando não são números válidos', () => {
    expect(inferColumnType(['2024-01', '2024-02'], 'pt-BR')).toBe('date')
    expect(inferColumnType(['01/2024', '02/2024'], 'pt-BR')).toBe('date')
  })

  it('cai para categoria quando o texto domina', () => {
    expect(inferColumnType(['Norte', 'Sul', '12'], 'pt-BR')).toBe('category')
  })
})

describe('parseDelimited', () => {
  it('detecta ponto e vírgula e locale brasileiro', () => {
    const csv = 'Região;Valor\nNorte;1.234,50\nSul;987,10'
    expect(detectDelimiter(csv)).toBe(';')
    expect(detectLocale(csv)).toBe('pt-BR')

    const source = parseDelimited(csv)
    expect(source.header).toEqual(['Região', 'Valor'])
    expect(source.rows).toHaveLength(2)
  })

  it('trata cabeçalhos que são anos como cabeçalho', () => {
    // Regressão: a heurística antiga somava indícios por coluna e concluía que
    // "Cidade;2019;2024" era uma linha de dados.
    const source = parseDelimited('Cidade;2019;2024\nBelém;58,2;71,4\nRecife;66,1;74,2')
    expect(source.header).toEqual(['Cidade', '2019', '2024'])
    expect(source.rows).toHaveLength(2)
  })

  it('reconhece uma matriz puramente numérica como sem cabeçalho', () => {
    const source = parseDelimited('1;2\n3;4\n5;6')
    expect(source.header).toEqual(['Coluna 1', 'Coluna 2'])
    expect(source.rows).toHaveLength(3)
  })

  it('desambigua colunas com o mesmo nome', () => {
    const source = parseDelimited('A,A,B\n1,2,3')
    expect(source.header).toEqual(['A', 'A (2)', 'B'])
  })

  it('faz ida e volta por CSV sem perder células', () => {
    const source = parseDelimited('Nome,Valor\n"Silva, João",10\nMaria,20')
    const round = parseDelimited(toCSV(source))
    expect(round.rows[0][0]).toBe('Silva, João')
  })
})

describe('transformações', () => {
  const source = parseDelimited('Região;2019;2024\nNorte;10;30\nSul;20;40')

  it('transpõe trocando cabeçalho pela primeira coluna', () => {
    const t = transposeSource(source)
    expect(t.header).toEqual(['Região', 'Norte', 'Sul'])
    expect(t.rows[0]).toEqual(['2019', '10', '20'])
  })

  it('ordena e limita', () => {
    const dataset = deriveDataset(source, {
      ...DEFAULT_TRANSFORM,
      sortBy: '2024',
      sortDirection: 'desc',
      limit: 1,
    })
    expect(dataset.rows).toHaveLength(1)
    expect(dataset.rows[0]['Região']).toBe('Sul')
  })

  it('esconde colunas', () => {
    const dataset = deriveDataset(source, { ...DEFAULT_TRANSFORM, hiddenColumns: ['2019'] })
    expect(dataset.columns.map((c) => c.name)).toEqual(['Região', '2024'])
  })

  it('pivota formato longo para largo', () => {
    const longSource = parseDelimited(
      'Mês;Canal;Valor\n2024-01;A;10\n2024-01;B;20\n2024-02;A;30\n2024-02;B;40',
    )
    const dataset = deriveDataset(longSource)
    const { dataset: wide, series } = pivotLongToWide(dataset, 'Mês', 'Canal', 'Valor')
    expect(series).toEqual(['A', 'B'])
    expect(wide.rows).toHaveLength(2)
    expect(wide.rows[0]['A']).toBe(10)
    expect(wide.rows[1]['B']).toBe(40)
  })
})
