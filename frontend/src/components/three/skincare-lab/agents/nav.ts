import * as THREE from 'three'

/**
 * Walkable floor grid baked from the Blender room (labAgents.json). Cells are
 * square, laid out over three.js x / z; '1' = blocked (furniture or wall,
 * already widened by the agent radius), '0' = free.
 */
export type GridData = { x0: number; z0: number; cell: number; cols: number; rows: number; data: string[] }

type Cell = { i: number; j: number }

export class NavGrid {
  private readonly blocked: Uint8Array

  constructor(private readonly g: GridData) {
    this.blocked = new Uint8Array(g.cols * g.rows)
    g.data.forEach((row, j) => {
      for (let i = 0; i < g.cols; i++) this.blocked[j * g.cols + i] = row.charCodeAt(i) === 49 ? 1 : 0
    })
  }

  /** Mark a world rectangle (x / z, already widened by the agent radius) as blocked — for furniture added at runtime. */
  block(minX: number, maxX: number, minZ: number, maxZ: number) {
    const { x0, z0, cell, cols, rows } = this.g
    const i0 = Math.max(0, Math.floor((minX - x0) / cell))
    const i1 = Math.min(cols - 1, Math.floor((maxX - x0) / cell))
    const j0 = Math.max(0, Math.floor((minZ - z0) / cell))
    const j1 = Math.min(rows - 1, Math.floor((maxZ - z0) / cell))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.blocked[j * cols + i] = 1
  }

  private free(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.g.cols && j < this.g.rows && this.blocked[j * this.g.cols + i] === 0
  }

  private toCell(p: THREE.Vector2): Cell {
    return { i: Math.floor((p.x - this.g.x0) / this.g.cell), j: Math.floor((p.y - this.g.z0) / this.g.cell) }
  }

  private toPoint(c: Cell) {
    return new THREE.Vector2(this.g.x0 + (c.i + 0.5) * this.g.cell, this.g.z0 + (c.j + 0.5) * this.g.cell)
  }

  /** Nearest free cell (stations sit right at furniture, so their own cell can be blocked). */
  private nearestFree(c: Cell): Cell | null {
    if (this.free(c.i, c.j)) return c
    for (let r = 1; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          if (this.free(c.i + di, c.j + dj)) return { i: c.i + di, j: c.j + dj }
        }
      }
    }
    return null
  }

  /** True when the straight segment between two points stays on free cells. */
  private clear(a: THREE.Vector2, b: THREE.Vector2) {
    const steps = Math.ceil(a.distanceTo(b) / (this.g.cell * 0.5))
    const p = new THREE.Vector2()
    for (let k = 0; k <= steps; k++) {
      p.lerpVectors(a, b, k / Math.max(1, steps))
      const c = this.toCell(p)
      if (!this.free(c.i, c.j)) return false
    }
    return true
  }

  /** A* (8-connected) from `from` to `to`, then shortcut to as few straight legs as the grid allows. */
  findPath(from: THREE.Vector2, to: THREE.Vector2): THREE.Vector2[] {
    const s = this.nearestFree(this.toCell(from))
    const t = this.nearestFree(this.toCell(to))
    if (!s || !t) return [to.clone()]
    const { cols, rows } = this.g
    const idx = (c: Cell) => c.j * cols + c.i
    const gScore = new Float32Array(cols * rows).fill(Infinity)
    const came = new Int32Array(cols * rows).fill(-1)
    const closed = new Uint8Array(cols * rows)
    const h = (c: Cell) => {
      const dx = Math.abs(c.i - t.i)
      const dy = Math.abs(c.j - t.j)
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
    }
    // Small binary heap of [f, index].
    const heap: [number, number][] = []
    const push = (f: number, k: number) => {
      heap.push([f, k])
      let n = heap.length - 1
      while (n > 0) {
        const p = (n - 1) >> 1
        if (heap[p][0] <= heap[n][0]) break
        ;[heap[p], heap[n]] = [heap[n], heap[p]]
        n = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let n = 0
        for (;;) {
          const l = 2 * n + 1
          const r = l + 1
          let m = n
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r
          if (m === n) break
          ;[heap[m], heap[n]] = [heap[n], heap[m]]
          n = m
        }
      }
      return top
    }
    gScore[idx(s)] = 0
    push(h(s), idx(s))
    const goal = idx(t)
    while (heap.length) {
      const [, k] = pop()
      if (k === goal) break
      if (closed[k]) continue
      closed[k] = 1
      const ci = k % cols
      const cj = (k - ci) / cols
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = ci + di
          const nj = cj + dj
          if (!this.free(ni, nj)) continue
          if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue // no corner cutting
          const nk = nj * cols + ni
          const ng = gScore[k] + (di && dj ? Math.SQRT2 : 1)
          if (ng < gScore[nk]) {
            gScore[nk] = ng
            came[nk] = k
            push(ng + h({ i: ni, j: nj }), nk)
          }
        }
      }
    }
    if (came[goal] === -1 && goal !== idx(s)) return [to.clone()]
    const cells: THREE.Vector2[] = []
    for (let k = goal; k !== -1; k = came[k]) cells.push(this.toPoint({ i: k % cols, j: Math.floor(k / cols) }))
    cells.reverse()
    // String-pull: keep only the corners needed to stay on free cells.
    const pts = [from.clone(), ...cells, to.clone()]
    const out = [pts[0]]
    let anchor = 0
    for (let n = 2; n < pts.length; n++) {
      if (!this.clear(pts[anchor], pts[n])) {
        out.push(pts[n - 1])
        anchor = n - 1
      }
    }
    out.push(pts[pts.length - 1])
    return out.slice(1)
  }
}
