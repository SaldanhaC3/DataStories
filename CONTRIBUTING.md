# Como contribuir

## Ambiente

```bash
npm install
npm run dev      # editor em http://localhost:5173
npm test         # núcleo
npm run build    # tipos + bundle
```

## Antes de abrir um PR

1. `npm run build` limpo (ele roda `tsc --noEmit` antes do bundle).
2. `npm test` verde.
3. Abra `/gallery.html` e passe o olho: ela desenha todos os tipos e temas com os mesmos dados, e
   é onde regressão de layout aparece — rótulo cortado, margem errada, texto sobreposto.
4. Se a mudança afeta o desenho, diga no PR quais gráficos você conferiu.

## Onde mexer

| Quero... | Mexo em |
|---|---|
| Novo tipo de gráfico | `src/core/render/` — uma `ChartDefinition` e o registro em `index.ts` |
| Novo tema ou paleta | `src/core/theme/` |
| Nova regra editorial | `src/advisor/lint.ts` |
| Novo formato de data ou número | `src/core/dataset/infer.ts` |
| Layout, eixos, margens | `src/core/frame.ts` |
| Interface | `src/ui/` |

## Regras da casa

**A engine não conhece React.** Nada em `src/core/` pode importar React ou tocar no DOM.
Renderizadores devolvem nós de cena; quem desenha é o consumidor. É o que permite testar sem DOM
e usar o mesmo código no editor, no PNG e no embed.

**Toda regra do linter traz a razão junto.** Um aviso sem motivo vira ruído que se aprende a
ignorar, e aí a ferramenta perde o que ela tem de diferente. Se você não consegue escrever a
frase que explica por que aquilo é um problema, provavelmente não é uma regra — é uma preferência.

**Convenções vêm de fonte, não de gosto.** Se a proposta é mudar um padrão visual, cite o guia
que a sustenta. Se for uma escolha estética legítima, ela provavelmente pertence a um tema novo,
não ao padrão.

**Não prometa o que não dá para verificar.** Se você afirmar em comentário ou README que uma
paleta é segura para daltonismo, escreva o teste que comprova. As garantias atuais estão em
`tests/render.test.ts` e são deliberadamente modestas, porque são as que se sustentam.

**Comentário explica o porquê.** O código já mostra o quê. Comentário bom é o que registra a
decisão e o caso que ela evita.
