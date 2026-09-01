/**
 * Anticolisão de rótulos.
 *
 * Rótulo direto só substitui a legenda se ele for legível — e séries que
 * terminam próximas produzem textos sobrepostos. Este módulo empurra os
 * rótulos verticalmente o mínimo necessário para que nenhum encoste no
 * vizinho, mantendo a ordem original (crucial: trocar a ordem faria o rótulo
 * apontar para a linha errada).
 */

export interface LabelSlot {
  /** Posição ideal, normalmente o y do último ponto da série. */
  target: number
  height: number
  /** Preenchido pelo algoritmo. */
  y: number
}

/**
 * Resolve as sobreposições com um passe de agrupamento: itens que colidem são
 * tratados como um bloco e o bloco inteiro é recentrado no alvo médio. É o
 * mesmo princípio do posicionamento de rótulos de mapa, e converge sem
 * iteração cega.
 */
export function resolveVerticalCollisions(
  slots: LabelSlot[],
  bounds: { top: number; bottom: number },
  gap = 2,
): LabelSlot[] {
  if (slots.length === 0) return slots

  // Trabalhamos em ordem de posição, mas devolvemos na ordem de entrada.
  const order = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => a.slot.target - b.slot.target)

  interface Cluster {
    items: Array<{ slot: LabelSlot; index: number }>
    top: number
    height: number
  }

  const clusters: Cluster[] = []

  for (const item of order) {
    const height = item.slot.height + gap
    const cluster: Cluster = {
      items: [item],
      top: item.slot.target - item.slot.height / 2 - gap / 2,
      height,
    }
    clusters.push(cluster)

    // Funde para trás enquanto houver sobreposição.
    while (clusters.length > 1) {
      const current = clusters[clusters.length - 1]
      const previous = clusters[clusters.length - 2]
      if (previous.top + previous.height <= current.top) break

      const merged: Cluster = {
        items: [...previous.items, ...current.items],
        top: 0,
        height: previous.height + current.height,
      }
      // Recentra o bloco na média dos alvos, ponderada por nada — a média
      // simples é o que minimiza o deslocamento total.
      const center =
        merged.items.reduce((sum, i) => sum + i.slot.target, 0) / merged.items.length
      merged.top = center - merged.height / 2
      clusters.splice(clusters.length - 2, 2, merged)
    }
  }

  // Empurra para dentro dos limites, do topo para baixo e depois de volta.
  let cursor = bounds.top
  for (const cluster of clusters) {
    if (cluster.top < cursor) cluster.top = cursor
    cursor = cluster.top + cluster.height
  }
  cursor = bounds.bottom
  for (let i = clusters.length - 1; i >= 0; i--) {
    const cluster = clusters[i]
    if (cluster.top + cluster.height > cursor) cluster.top = cursor - cluster.height
    cursor = cluster.top
  }

  for (const cluster of clusters) {
    let y = cluster.top
    for (const item of cluster.items) {
      const height = item.slot.height + gap
      item.slot.y = y + height / 2
      y += height
    }
  }

  return slots
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function overlaps(a: Box, b: Box, padding = 0): boolean {
  return !(
    a.x + a.w + padding <= b.x ||
    b.x + b.w + padding <= a.x ||
    a.y + a.h + padding <= b.y ||
    b.y + b.h + padding <= a.y
  )
}

/**
 * Escolhe a primeira posição candidata livre de colisão. Usado por rótulos de
 * valor sobre marcas, onde há várias posições aceitáveis (acima, dentro, ao
 * lado) e a preferência é ordenada.
 */
export function firstFreeCandidate(
  candidates: Box[],
  occupied: Box[],
  padding = 2,
): Box | null {
  for (const candidate of candidates) {
    if (!occupied.some((box) => overlaps(candidate, box, padding))) return candidate
  }
  return null
}
