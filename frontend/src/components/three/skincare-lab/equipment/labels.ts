import type { LabelAtlas, UVRect } from './kit'

/**
 * Original label, screen and sign artwork for the skincare lab, drawn into the
 * shared atlas. Everything here is illustrative: instrument readings are
 * marked PREVIEW and no label claims a certification or a validated result.
 */

const SANS = '"Helvetica Neue", Arial, sans-serif'
const MONO = '"Consolas", "Menlo", monospace'

export const INK = '#1d2a33'
export const TEAL = '#0f8a8f'

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700, family = SANS) {
  let s = size
  do {
    ctx.font = `${weight} ${s}px ${family}`
    if (ctx.measureText(text).width <= maxW) break
    s -= 1
  } while (s > 8)
  return s
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export type ContainerLabel = {
  code: string
  name: string
  sub?: string
  accent?: string
  paper?: string
}

/** Ingredient / sample container label: coloured code band, name, detail line. */
export function containerLabel(atlas: LabelAtlas, key: string, l: ContainerLabel): UVRect {
  return atlas.cell(`label:${key}`, 1, 1, (ctx, w, h) => {
    ctx.fillStyle = l.paper ?? '#fbfaf5'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = l.accent ?? TEAL
    ctx.fillRect(0, 0, w, 30)
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    fit(ctx, l.code, w - 24, 19, 700)
    ctx.fillText(l.code, 12, 16)
    ctx.fillStyle = INK
    fit(ctx, l.name, w - 24, 30, 800)
    ctx.fillText(l.name, 12, 62)
    if (l.sub) {
      ctx.fillStyle = '#4c5d68'
      fit(ctx, l.sub, w - 24, 18, 500)
      ctx.fillText(l.sub, 12, 98)
    }
    // Hairline border so the label edge reads at an angle.
    ctx.strokeStyle = 'rgba(29,42,51,0.25)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, w - 2, h - 2)
  })
}

export type DisplayLines = { main: string; unit?: string; sub?: string }

/** Instrument LCD with an example reading, always tagged PREVIEW. */
export function displayCell(atlas: LabelAtlas, key: string, d: DisplayLines): UVRect {
  return atlas.cell(`display:${key}`, 1, 1, (ctx, w, h) => {
    ctx.fillStyle = '#0c181d'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#27414a'
    ctx.lineWidth = 4
    ctx.strokeRect(4, 4, w - 8, h - 8)

    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#93ecdc'
    const mainSize = fit(ctx, d.main, w - (d.unit ? 92 : 36), 50, 700, MONO)
    ctx.font = `700 ${mainSize}px ${MONO}`
    ctx.fillText(d.main, 16, 72)
    if (d.unit) {
      const mw = ctx.measureText(d.main).width
      ctx.fillStyle = '#6fc4b5'
      ctx.font = `600 24px ${SANS}`
      ctx.fillText(d.unit, 24 + mw, 72)
    }
    if (d.sub) {
      ctx.fillStyle = '#6fa9a0'
      fit(ctx, d.sub, w - 32, 19, 600, MONO)
      ctx.fillText(d.sub, 16, 106)
    }
    // Example values only.
    ctx.fillStyle = '#f2b45c'
    ctx.font = `700 15px ${SANS}`
    const tag = 'PREVIEW'
    const tw = ctx.measureText(tag).width
    ctx.fillText(tag, w - tw - 14, 26)
  })
}

/** Teal sign plate for zones and storage. */
export function signCell(atlas: LabelAtlas, key: string, text: string, sub?: string): UVRect {
  return atlas.cell(`sign:${key}`, 2, 1, (ctx, w, h) => {
    ctx.fillStyle = '#0d7378'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#e8f6f5'
    ctx.fillRect(10, 10, 8, h - 20)
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    fit(ctx, text, w - 60, 46, 800)
    ctx.fillText(text, 34, sub ? 50 : h / 2 + 2)
    if (sub) {
      ctx.fillStyle = '#bfe7e4'
      fit(ctx, sub, w - 60, 24, 600)
      ctx.fillText(sub, 34, 94)
    }
  })
}

/** Version tag (V1 / V2-A / V2-B) for the comparison tray. */
export function tagCell(atlas: LabelAtlas, key: string, text: string, color: string): UVRect {
  return atlas.cell(`tag:${key}`, 1, 1, (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    fit(ctx, text, w - 30, 72, 800)
    ctx.fillText(text, w / 2, h / 2 + 4)
    ctx.textAlign = 'left'
  })
}

/** Graduation marks for beakers: white ticks on a transparent cell. */
export function graduationCell(atlas: LabelAtlas): UVRect {
  return atlas.cell('decal:graduation', 1, 1, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font = `700 15px ${SANS}`
    ctx.textBaseline = 'middle'
    const steps = 6
    for (let i = 0; i <= steps; i++) {
      const y = h - 8 - (i * (h - 16)) / steps
      const major = i % 2 === 0
      ctx.fillRect(40, y - 1.5, major ? 60 : 34, 3)
      if (major && i > 0) ctx.fillText(`${i * 50}`, 108, y)
    }
    ctx.fillRect(40, 8, 4, h - 16)
  })
}

/** Open batch record notebook: two ruled pages with an original form layout. */
export function notebookCell(atlas: LabelAtlas): UVRect {
  return atlas.cell('notebook:batch-record', 2, 3, (ctx, w, h) => {
    ctx.fillStyle = '#fbfaf3'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(29,42,51,0.12)'
    ctx.fillRect(w / 2 - 3, 0, 6, h)

    const page = (x0: number) => {
      const pw = w / 2
      ctx.strokeStyle = 'rgba(15,138,143,0.35)'
      ctx.lineWidth = 2
      for (let y = 70; y < h - 20; y += 22) {
        ctx.beginPath()
        ctx.moveTo(x0 + 22, y)
        ctx.lineTo(x0 + pw - 22, y)
        ctx.stroke()
      }
      return pw
    }
    page(0)
    page(w / 2)

    ctx.fillStyle = INK
    ctx.textBaseline = 'alphabetic'
    ctx.font = `800 24px ${SANS}`
    ctx.fillText('BATCH RECORD', 24, 40)
    ctx.font = `600 16px ${MONO}`
    ctx.fillStyle = TEAL
    ctx.fillText('RL-B026 · V2-A', 24, 62)

    // Phase table (headers printed, entries "handwritten").
    ctx.fillStyle = '#4c5d68'
    ctx.font = `700 14px ${SANS}`
    const rows = ['PHASE A  water', 'PHASE B  oil', 'PHASE C  cool-down', 'pH check', 'Viscosity', 'Appearance']
    rows.forEach((r, i) => ctx.fillText(r, 24, 108 + i * 44))
    ctx.strokeStyle = 'rgba(29,60,90,0.75)'
    ctx.lineWidth = 2.2
    rows.forEach((_, i) => {
      const y = 104 + i * 44
      ctx.beginPath()
      let x = 140
      ctx.moveTo(x, y)
      for (let k = 0; k < 9; k++) {
        x += 9 + ((k * 7) % 5)
        ctx.quadraticCurveTo(x - 4, y - 8 + ((k * 5) % 9), x, y + ((k % 2) * 3 - 1))
      }
      ctx.stroke()
    })

    // Right page: observation notes + a small comparison grid.
    const x0 = w / 2 + 24
    ctx.fillStyle = INK
    ctx.font = `800 20px ${SANS}`
    ctx.fillText('Observations', x0, 40)
    ctx.fillStyle = '#4c5d68'
    ctx.font = `700 13px ${SANS}`
    ;['', 'V1', 'V2-A', 'V2-B'].forEach((t, i) => ctx.fillText(t, x0 + 70 + i * 50 - 50, 92))
    ;['texture', 'spread', 'odour'].forEach((t, i) => ctx.fillText(t, x0, 122 + i * 30))
    ctx.strokeStyle = 'rgba(29,42,51,0.35)'
    ctx.lineWidth = 1.5
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(x0, 102 + i * 30)
      ctx.lineTo(x0 + 220, 102 + i * 30)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(29,60,90,0.75)'
    ctx.lineWidth = 2.2
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const cx = x0 + 78 + c * 50
        const cy = 117 + r * 30
        ctx.beginPath()
        ctx.moveTo(cx - 6, cy)
        ctx.lineTo(cx - 1, cy + 5)
        ctx.lineTo(cx + 8, cy - 6)
        ctx.stroke()
      }
    ctx.fillStyle = '#9a6b2f'
    ctx.font = `700 13px ${SANS}`
    ctx.fillText('Screening notes only —', x0, 250)
    ctx.fillText('not a test result', x0, 268)
  })
}

/** Glove box print. */
export function gloveBoxCell(atlas: LabelAtlas): UVRect {
  return atlas.cell('print:gloves', 1, 1, (ctx, w, h) => {
    ctx.fillStyle = '#f4f7f8'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#3f7fcf'
    ctx.fillRect(0, h - 26, w, 26)
    ctx.fillStyle = INK
    ctx.textBaseline = 'middle'
    fit(ctx, 'NITRILE GLOVES', w - 30, 30, 800)
    ctx.fillText('NITRILE GLOVES', 15, 36)
    ctx.fillStyle = '#4c5d68'
    ctx.font = `600 20px ${SANS}`
    ctx.fillText('powder-free · size M', 15, 72)
  })
}

/** A row of small printed words (key legends, rating plates). */
export function textStrip(atlas: LabelAtlas, key: string, words: string[], fg: string, bg: string): UVRect {
  return atlas.cell(`strip:${key}`, 2, 1, (ctx, w, h) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = fg
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    const cw = w / words.length
    words.forEach((word, i) => {
      fit(ctx, word, cw - 16, 56, 700)
      ctx.fillText(word, cw * (i + 0.5), h / 2 + 2)
    })
    ctx.textAlign = 'left'
  })
}
