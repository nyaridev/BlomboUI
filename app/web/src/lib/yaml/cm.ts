import { yaml } from '@codemirror/lang-yaml'
import { linter, type Diagnostic } from '@codemirror/lint'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorSelection, EditorState, Prec, RangeSetBuilder, Transaction } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { continueLine, isSingleLineChunk } from '@/lib/prompt/textareaEdit.ts'
import { nudgePromptWeight } from '@/lib/prompt/weight.ts'
import { yamlBlocks, yamlGuides, yamlIssues } from '@/lib/yaml/lint.ts'

const yamlHighlight = HighlightStyle.define([
  { tag: t.lineComment, color: 'var(--color-muted)' },
  { tag: t.comment, color: 'var(--color-muted)' },
  { tag: t.definition(t.propertyName), color: 'var(--color-green-bright)' },
  { tag: t.propertyName, color: 'var(--color-green-bright)' },
  { tag: t.separator, color: 'var(--color-label)' },
  { tag: t.punctuation, color: 'var(--color-muted)' },
  { tag: t.string, color: 'var(--color-ink)' },
  { tag: t.content, color: 'var(--color-ink)' },
  { tag: t.meta, color: 'var(--color-muted)' },
])

const yamlTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.875rem',
    backgroundColor: 'transparent',
    color: 'var(--color-ink)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  '.cm-content': {
    caretColor: 'var(--color-ink)',
    padding: '0.375rem 0',
    minHeight: '16rem',
    lineHeight: '1.5rem',
  },
  '.cm-line': { position: 'relative', padding: '0 0.5rem' },
  '.cm-gutters': {
    backgroundColor: 'color-mix(in srgb, var(--color-bg) 40%, var(--color-field))',
    color: 'var(--color-muted)',
    border: 'none',
  },
  '.cm-gutterElement': { lineHeight: '1.5rem' },
  '.cm-foldGutter .cm-gutterElement, .cm-lineNumbers .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
  },
  '.cm-lineNumbers .cm-gutterElement': { justifyContent: 'flex-end' },
  '.cm-foldGutter .cm-gutterElement': { justifyContent: 'center' },
  '.cm-foldGutter svg': { display: 'block', overflow: 'visible' },
  '.cm-activeLineGutter, .cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--color-line) 35%, transparent)',
  },
  '.cm-activeLine.yaml-hl-error': {
    backgroundColor: 'color-mix(in srgb, var(--color-red) 22%, transparent)',
  },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent) !important',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-ink)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-line)',
    border: 'none',
    color: 'var(--color-muted)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--color-panel)',
    color: 'var(--color-ink)',
    borderTop: '1px solid var(--color-line)',
  },
  '.cm-panel.cm-search': { padding: '0.375rem 0.5rem' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
    color: 'var(--color-ink)',
  },
  '.cm-panel.cm-search input': {
    backgroundColor: 'var(--color-field)',
    border: '1px solid var(--color-line)',
    borderRadius: '0.25rem',
  },
  '.cm-panel.cm-search button': {
    backgroundColor: 'var(--color-field)',
    border: '1px solid var(--color-line)',
    borderRadius: '0.25rem',
    color: 'var(--color-ink)',
  },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 35%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 55%, transparent)' },
})

function depthClass(indent: number) {
  return `yaml-d${(((Math.floor(indent / 2) % 10) + 10) % 10)}`
}

class GuideWidget extends WidgetType {
  indents: number[]
  constructor(indents: number[]) {
    super()
    this.indents = indents
  }
  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'yaml-guides'
    wrap.setAttribute('aria-hidden', 'true')
    for (const indent of this.indents) {
      const el = document.createElement('span')
      el.className = `yaml-guide ${depthClass(indent)}`
      el.style.left = `calc(0.5rem + ${indent}ch)`
      wrap.appendChild(el)
    }
    return wrap
  }
  eq(other: GuideWidget) {
    return other.indents.join() === this.indents.join()
  }
  ignoreEvent() {
    return true
  }
}

function yamlGuideDeco(view: EditorView) {
  const lines = view.state.doc.toString().split('\n')
  const byLine = yamlGuides(lines, yamlBlocks(lines))
  const builder = new RangeSetBuilder<Decoration>()
  for (let i = 0; i < lines.length; i += 1) {
    const indents = byLine[i]
    if (!indents?.length) {
      continue
    }
    const line = view.state.doc.line(i + 1)
    builder.add(line.from, line.from, Decoration.widget({ widget: new GuideWidget(indents), side: -1 }))
  }
  return builder.finish()
}

const yamlGuidesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = yamlGuideDeco(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = yamlGuideDeco(update.view)
      }
    }
  },
  { decorations: (value) => value.decorations },
)

function yamlIssueDeco(view: EditorView) {
  const issues = yamlIssues(view.state.doc.toString()).slice().sort((a, b) => a.line - b.line)
  const builder = new RangeSetBuilder<Decoration>()
  const seen = new Set<number>()
  for (const issue of issues) {
    const n = Math.min(view.state.doc.lines, Math.max(1, issue.line + 1))
    if (seen.has(n)) {
      continue
    }
    seen.add(n)
    const line = view.state.doc.line(n)
    builder.add(
      line.from,
      line.from,
      Decoration.line({ class: 'yaml-hl-error', attributes: { 'data-yaml-note': issue.message.replace(/[\u0000-\u001f]/g, ' ') } }),
    )
  }
  return builder.finish()
}

const yamlIssuesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = yamlIssueDeco(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = yamlIssueDeco(update.view)
      }
    }
  },
  { decorations: (value) => value.decorations },
)

function foldChevron(open: boolean) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', open ? '0 0 12 8' : '0 0 8 12')
  svg.setAttribute('width', open ? '10' : '7')
  svg.setAttribute('height', open ? '7' : '10')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', open ? 'M2 2l4 4 4-4' : 'M2 2l4 4-4 4')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.6')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  const wrap = document.createElement('span')
  wrap.appendChild(svg)
  return wrap
}

function applyEdit(view: EditorView, text: string, start: number, end: number) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: EditorSelection.range(start, end),
    scrollIntoView: true,
  })
  return true
}

function weightKey(dir: 1 | -1, step: () => number) {
  return (view: EditorView) => {
    const { from, to } = view.state.selection.main
    const text = view.state.doc.toString()
    if (!isSingleLineChunk(text, from, to)) {
      return false
    }
    const next = nudgePromptWeight(text, from, to, dir, step())
    return next ? applyEdit(view, next.text, next.start, next.end) : false
  }
}

export function yamlEditorExtensions(opts: { onChange: (text: string) => void; weightStep: () => number }) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter({ markerDOM: foldChevron }),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search(),
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    yaml(),
    syntaxHighlighting(yamlHighlight),
    yamlTheme,
    yamlGuidesPlugin,
    yamlIssuesPlugin,
    linter((view) => {
      const out: Diagnostic[] = []
      const seen = new Set<number>()
      for (const issue of yamlIssues(view.state.doc.toString())) {
        const n = Math.min(view.state.doc.lines, Math.max(1, issue.line + 1))
        if (seen.has(n)) {
          continue
        }
        seen.add(n)
        const line = view.state.doc.line(n)
        out.push({ from: line.from, to: line.to, severity: 'error', message: issue.message })
      }
      return out
    }, { delay: 150 }),
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
    Prec.high(
      keymap.of([
        {
          key: 'Enter',
          run: (view) => {
            const { from, to } = view.state.selection.main
            const next = continueLine(view.state.doc.toString(), from, to, true)
            return applyEdit(view, next.text, next.start, next.end)
          },
        },
        indentWithTab,
        { key: 'Ctrl-ArrowUp', run: weightKey(1, opts.weightStep) },
        { key: 'Cmd-ArrowUp', run: weightKey(1, opts.weightStep) },
        { key: 'Ctrl-ArrowDown', run: weightKey(-1, opts.weightStep) },
        { key: 'Cmd-ArrowDown', run: weightKey(-1, opts.weightStep) },
      ]),
    ),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !update.transactions.some((tr) => tr.annotation(Transaction.remote))) {
        opts.onChange(update.state.doc.toString())
      }
    }),
  ]
}

export function setYamlDoc(view: EditorView, value: string) {
  const current = view.state.doc.toString()
  if (current === value) {
    return
  }
  const head = Math.min(view.state.selection.main.head, value.length)
  view.dispatch({
    changes: { from: 0, to: current.length, insert: value },
    selection: EditorSelection.cursor(head),
    annotations: Transaction.remote.of(true),
  })
}
