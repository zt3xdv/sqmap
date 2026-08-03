export const Reset = '\x1b[0m'
export const Dim = '\x1b[2m'
export const Bold = '\x1b[1m'
export const Green = '\x1b[32m'
export const Cyan = '\x1b[36m'
export const Yellow = '\x1b[33m'
export const Red = '\x1b[31m'
export const Clear = '\x1b[2K\r'

export function header() {
  process.stdout.write(`\n${Bold}  sqmap${Reset}${Reset}\n\n`)
}

export function section(title) {
  process.stdout.write(`  ${Yellow}${title}${Reset}\n`)
}

export function write(value = "") {
  process.stdout.write(`  ${Reset}${value}\n`)
}

export function info(label, value, pad = 12) {
  process.stdout.write(`  ${Dim}${label.padEnd(pad)}${Reset} ${value}\n`)
}

export function success(msg) {
  process.stdout.write(`${Clear}${Green}✓${Reset} ${msg}\n`)
}

export function error(msg) {
  process.stderr.write(`${Clear}${Red}error:${Reset} ${msg}\n`)
}

export function spinner(label) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  let stopped = false
  let currentLabel = label
  const interval = setInterval(() => {
    if (stopped) return
    process.stdout.write(`${Clear}${Cyan}${frames[i % frames.length]}${Reset} ${currentLabel}`)
    i++
  }, 80)
  return {
    update(newLabel) {
      currentLabel = newLabel
    },
    stop(ok) {
      stopped = true
      clearInterval(interval)
      const mark = ok ? `${Green}✓${Reset}` : `${Red}✗${Reset}`
      process.stdout.write(`${Clear}${mark} ${currentLabel}\n`)
    },
  }
}

export function progress(label, current, total) {
  const pct = total > 0 ? Math.floor((current / total) * 100) : 0
  const width = 24
  const filled = Math.floor((width * current) / Math.max(total, 1))
  const bar = '█'.repeat(filled) + `${Dim}·${Reset}`.repeat(width - filled)
  process.stdout.write(`${Clear}${Cyan}${bar}${Reset} ${current}/${total} ${Dim}${label} ${pct}%${Reset}`)
}
