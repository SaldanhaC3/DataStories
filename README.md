# DataStories

Editor open source de gráficos com padrão editorial. Roda no navegador: você cola os dados,
escolhe o gráfico, anota a história e exporta.

É uma alternativa livre ao Datawrapper e ao Flourish, com uma tese específica: **o caminho mais
fácil deve produzir o gráfico bem-feito.** O padrão do editor já é o padrão profissional, e um
linter avisa quando você está saindo dele — sempre explicando por quê.

---

## Por que mais uma ferramenta de gráficos

Bibliotecas como Chart.js e Plotly entregam gráficos *corretos*, mas visualmente genéricos.
Ferramentas de BI entregam painéis. O que separa um gráfico do Financial Times de um gráfico de
biblioteca não é o tipo de gráfico — é o acabamento:

| Prática | Onde aparece aqui |
|---|---|
| Título é a conclusão, não o assunto | Etapa Anotar, com o linter cobrando |
| Rótulo direto em vez de legenda | Ligado por padrão, com anticolisão |
| Uma série colorida, o resto em cinza | Um clique na marca ou no chip |
| Anotação apontando o momento decisivo | Texto com seta, faixa, linha de referência |
| Fonte sempre citada | Campo no rodapé, cobrado pelo linter |
| Sem chartjunk | Grade fraca, sem moldura, sem tick, sem 3D |
| Cor acessível | Paletas auditadas para daltonismo e contraste |

## Rodando

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Não há servidor, banco nem conta: tudo roda no navegador e o
rascunho fica no `localStorage`.

```bash
npm run build   # checagem de tipos + bundle de produção em dist/
npm test        # 84 testes sobre o núcleo
```

> Com npm 11, o `npm install` bloqueia scripts de instalação por padrão e o esbuild — usado pelo
> Vite — precisa do dele. Se o `npm run dev` reclamar do binário, rode
> `npm approve-scripts --allow-scripts-pending` e depois `npm rebuild esbuild`. O bloqueio existe
> por segurança e por isso não vem desativado no repositório.

Há também uma **galeria de referência** em `/gallery.html`, que desenha todos os tipos e temas
com os mesmos dados — use antes de publicar qualquer mudança no núcleo de desenho.
`/gallery.html?type=slope` mostra um gráfico só.

## O fluxo

**1. Dados** — cole do Excel ou do Sheets, arraste um CSV, ou digite na grade. O separador, o
formato numérico (`1.234,56` vs `1,234.56`) e o formato de data (`15/03/2024`, `mar/2024`,
`2024-Q1`) são detectados. Dá para transpor, ordenar e limitar sem voltar à planilha.

**2. Gráfico** — o conselheiro sugere os três tipos mais adequados ao formato da sua tabela e diz
o porquê de cada um. Catorze tipos disponíveis:

- **Núcleo editorial** — barras verticais e horizontais (agrupadas, empilhadas, 100%), linhas,
  área, dispersão
- **Comparação e ranking** — haltere, inclinação, pirulito, bala
- **Distribuição e composição** — histograma, boxplot, rosca, waffle, treemap

**3. Anotar** — título-conclusão, subtítulo, destaque de série ou categoria, rótulos diretos,
anotação de texto com seta arrastável, faixa de período, linha de referência, destaque de ponto,
cores por série e rodapé com fonte, nota e crédito.

**4. Publicar** — PNG em 1x/2x/3x, SVG vetorial, HTML autocontido para embed e o arquivo
`.datastories.json` do projeto.

## Arquitetura

O princípio: **a engine de gráficos não conhece React.** São funções puras
`(spec, dados, tamanho) → cena`, e a cena é uma árvore de nós geométricos. Três consumidores
diferentes leem a mesma cena — o editor, o exportador SVG e o embed —, e a engine inteira é
testável sem DOM.

```
src/
├─ core/                  ENGINE — zero React
│  ├─ types.ts            ChartSpec (o documento) e Scene (a saída)
│  ├─ schema.ts           validação zod, padrões e (de)serialização
│  ├─ dataset/            parse, inferência de tipo, transformações
│  ├─ model.ts            formato longo↔largo, empilhamento, cor, destaque
│  ├─ frame.ts            margens medidas, escalas, eixos, cabeçalho, rodapé
│  ├─ text.ts             medição e quebra de texto
│  ├─ render/             um módulo por família de gráfico + registro
│  ├─ annotate/           rótulos diretos, anticolisão, anotações
│  ├─ theme/              temas, paletas, contraste e daltonismo
│  └─ export/             SVG, PNG, embed, arquivo de projeto
├─ advisor/               recomendação de gráfico e linter editorial
├─ state/                 store com desfazer/refazer e autosave
└─ ui/                    editor React (4 etapas + tela)
```

### O `ChartSpec` é o documento

Um único objeto JSON descreve dados, transformações, tipo, escalas, tema, anotações e textos.
É ele que se salva, exporta e embute. Tem `specVersion`, e campos ausentes recebem o padrão pelo
schema — então acrescentar um campo novo não invalida arquivos já salvos.

### Acrescentar um tipo de gráfico

Escreva uma `ChartDefinition` e registre-a. Nada no editor precisa mudar:

```ts
export const MEU_GRAFICO: ChartDefinition = {
  type: 'meu-grafico',
  label: 'Meu gráfico',
  hint: 'Quando este gráfico é a escolha certa.',
  group: 'Núcleo editorial',
  orientation: 'vertical',
  categoryKind: () => 'band',
  bare: false,
  supportsDirectLabels: false,
  supportsStacking: false,
  seriesLimit: Infinity,
  draw: ({ model, frame, theme }) => [/* nós da cena */],
}
```

O `frame` entrega `catPos(i)`, `valuePos(v)` e `xy()` já resolvidos para a orientação, então o
mesmo `draw` serve para barras verticais e horizontais.

## Decisões que valem explicar

**Só fontes do sistema.** Um SVG rasterizado via `<img>` para canvas é um documento isolado e não
enxerga fontes web da página hospedeira — o PNG sairia com a tipografia errada. Pilhas de fontes
do sistema resolvem normalmente, o PNG sai fiel e o embed não depende de rede.

**Margens medidas, não chutadas.** O layout mede a largura real de cada rótulo antes de decidir a
margem. É a diferença entre um gráfico com respiro e um com rótulo cortado.

**Rótulo de categoria nunca é rotacionado.** Se não cabe, é rareado — e o linter sugere barras
horizontais, que é a correção de verdade.

**Barra parte do zero, linha não precisa.** Em barras a comparação é por comprimento, e cortar o
eixo infla as diferenças; o linter trata isso como erro. Em linhas a leitura é por posição, e
forçar o zero costuma achatar a série contra o topo.

**Sobre daltonismo, o que é possível prometer.** As três primeiras cores de cada paleta ficam
distinguíveis nas três deficiências; até a quarta, protanopia e deuteranopia (juntas, ~8% dos
homens) continuam seguras. Da quinta em diante, tritanopia perde pares quentes — nenhuma paleta
categórica de oito cores escapa disso, nem a Okabe–Ito. Por isso a resposta acima de seis séries
não é uma paleta melhor: é destacar uma ou duas. Os números estão verificados em
`tests/render.test.ts`.

## Referências

As convenções vêm de guias consolidados de visualização, não de gosto pessoal:
[Hands-On Data Visualization](https://handsondataviz.org/chart-design.html),
[School of Cities / Toronto](https://schoolofcities.github.io/urban-data-storytelling/),
Datawrapper Academy, o guia de visualização de dados da União Europeia e o
[PolicyViz](https://policyviz.com/).

## Licença

MIT. Os dados dos exemplos embutidos são fictícios, gerados para demonstração — o que está dito no
rodapé de cada um.
