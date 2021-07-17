const example = `
  <div [prop]="value" (event)="handler" #ref>
    Hello {{ person.name }} {{ person.age }}
    [[slot name]]
  </div>
`

const noop = () => { }
export class Component {
  constructor({
    selector,
    styles,
    template,
    main
  }) {
    this.parser = new DOMParser()
    this.selector = selector
    this.styles = styles
    this.bind = this._buildTemplate(template)
    this.main = main || noop
  }

  initialize(node, injector) {
    const scope = this._createScope()
    const { refs, update, unbind } = this.bind(node, scope)
    const args = this
      ._getFnParams(this.main)
      .map(param => {
        if (param === '$scope') return scope.proxy
        if (param === '$host') return node
        if (param === '$refs') return refs
        const arg = injector.find(param)
        if (arg === void 0) throw new Error(`Unknown injectable '${param}' requested in component '${this.selector}'.`)
        return arg
      })
    this.main(...args)
    update()
    return unbind
  }

  static _fnParamsRegex = /^\s*(?:(?:function\s*(?:\s[_$a-zA-Z][_$a-zA-Z0-9]*)?)?)\(((?:[_$a-zA-Z][_$a-zA-Z0-9]?(\s*,\s*)?)*)\s*\)|(?:([_$a-zA-Z][_$a-zA-Z0-9]*)\s*=>)|(?:\(\s*[_$a-zA-Z][_$a-zA-Z0-9]*\s*\)\s*=>)|(?:\s*[_$a-zA-Z][_$a-zA-Z0-9]*\s*)\(((?:[_$a-zA-Z][_$a-zA-Z0-9]?(\s*,\s*)?)*)\s*\)/
  static _splitParamsRegex = /[,\s*]/
  _getFnParams(fn) {
    const code = fn.toString()
    const match = code.match(Component._fnParamsRegex) || []
    const paramsStr = match[1] || match[3] || match[4] || ''
    return paramsStr.split(Component._splitParamsRegex).filter(Boolean)
  }

  _buildTemplate(htmlString) {
    const dom = this.parser.parseFromString(htmlString, 'text/html')
    const original = document.createDocumentFragment()
    original.append(...Array.from(dom.body.childNodes))
    // bind
    return (node, scope) => {
      const slotContent = this._getSlotContent(node)
      const copy = original.cloneNode(true)
      node.replaceChildren(copy)
      const meta = this._parseDomNodes(node.childNodes)
      for (let content of slotContent) {
        const slot = meta.slots[content.key]
        if (!slot) continue
        this._parseDomNodes(content.nodes, meta)
        slot.node.replaceWith(...content.nodes)
      }
      const { emitter, proxy } = scope
      // this._bindEvents(meta.events, proxy)
      const onUpdate = evt => {
        // const { path, target, key, value } = evt
        this._updateBindings(meta.bindings, scope.proxy, meta)
      }
      emitter.addEventListener('update', onUpdate)
      const update = () => {
        this._bindEvents(meta.events, proxy)
        onUpdate()
      }
      // unbind
      return {
        refs: meta.refs,
        update,
        unbind() {
          emitter.removeEventListener('update', onUpdate)
        }
      }
    }
  }

  _updateBindings(bindings, proxy, meta) {
    for (let binding of bindings) {
      switch (binding.type) {
        case 'expr':
          this._updateExprBinding(binding, proxy)
          break
        case 'prop':
          this._updatePropBinding(binding, proxy)
          break
        case 'loop':
          this._updateLoopBinding(binding, proxy, meta)
          break
      }
    }
  }

  _getFromScopeByPath(path, proxy) {
    const props = path.split('.')
    let value = proxy[props.shift()]
    for (let prop of props) {
      if (!value) return void 0
      value = value[prop]
    }
    return value || void 0
  }

  _updateExprBinding(binding, proxy) {
    const { expr, node } = binding
    const value = this._getFromScopeByPath(expr, proxy)
    node.textContent = value
  }

  _updatePropBinding(binding, proxy) {
    const { key, expr, node } = binding
    const value = this._getFromScopeByPath(expr, proxy)
    node.setAttribute(key, value)
  }

  _updateLoopBinding(binding, proxy, meta) {
    const {
      itemKey,
      expr,
      startNode,
      endNode,
      templateNode
    } = binding
    while (startNode.nextSibling && startNode.nextSibling !== endNode) {
      startNode.nextSibling.remove()
    }
    const items = this._getFromScopeByPath(expr, proxy) || []
    for (let i = 0, l = items.length; i < l; i++) {
      // const item = items[i]
      const node = templateNode.cloneNode(true)
      const itemMeta = this._parseDomNodes(node.childNodes, void 0, 'foo')
      this._bindEvents(itemMeta.events, proxy)
      itemMeta.bindings = itemMeta.bindings.map(binding => {
        if (binding.expr === itemKey || binding.expr.startsWith(`${itemKey}.`)) {
          binding.expr = `${expr}.${i}` + binding.expr.substring(itemKey.length)
        }
        return binding
      })
      this._updateBindings(itemMeta.bindings, proxy)
      meta.bindings.push(...itemMeta.bindings)
      endNode.parentNode.insertBefore(node, endNode)
    }
  }

  _bindEvents(events, proxy) {
    for (let evtMeta of events) {
      const { key, expr, node } = evtMeta
      const handler = this._getFromScopeByPath(expr, proxy)
      node.addEventListener(key, e => handler(e))
    }
  }

  _parseDomNodes(nodes, meta) {
    meta = meta || {
      refs: [],
      bindings: [],
      events: [],
      slots: {}
    }
    if (nodes instanceof NodeList) nodes = Array.from(nodes)
    if (!Array.isArray(nodes)) nodes = [nodes]
    this._parseNodes(nodes, meta)
    return meta
  }

  _parseNodes(nodes, meta, depth = 0) {
    if (!nodes || !nodes.length) return
    const pad = ' '.repeat(depth * 2)
    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i]
      switch (node.nodeType) {
        // Element Node
        case 1:
          const isLoop = node.hasAttribute('*for')
          if (isLoop) {
            this._parseLoopAttribute(node, meta)
            continue
          }
          this._parseAttributes(node, meta)
          this._parseNodes(node.childNodes, meta, depth + 1)
          break
        case 3:
          this._parseTextNode(node, meta)
          break
      }
    }
  }

  _parseLoopAttribute(node, meta) {
    const value = node.getAttribute('*for')
    const [itemKey, expr] = value.split(' of ').map(x => x.trim())
    const startNode = document.createComment(` *for ${itemKey} of ${value} `)
    const endNode = document.createComment(` *endfor `)
    const parent = node.parentNode
    parent.insertBefore(startNode, node)
    if (node.nextSibling) parent.insertBefore(endNode, node.nextSibling)
    else node.append(endNode)
    node.remove()
    meta.bindings.push({
      type: 'loop',
      itemKey,
      expr,
      startNode,
      endNode,
      templateNode: node
    })
  }

  _parseAttributes(node, meta) {
    const names = node.getAttributeNames()
    for (let name of names) {
      const expr = node.getAttribute(name)
      const first = name.charAt(0)
      const last = name.charAt(name.length - 1)
      if (first === '#') {
        meta.refs.push({
          key: name.substring(1),
          node
        })
      } else if (first === '[' && last === ']') {
        meta.bindings.push({
          type: 'prop',
          key: name.substring(1, name.length - 1),
          node,
          expr: expr.trim(),
        })
      } else if (first === '(' && last === ')') {
        meta.events.push({
          key: name.substring(1, name.length - 1),
          expr: expr.trim(),
          node
        })
      }
    }
  }

  static _primarySlot = Symbol('PrimarySlot')
  static interpRegex = /\{\{([^}]+)\}\}|\[\[slot(\s+[a-zA-Z][a-zA-Z0-9_-]+)?\]\]/g
  _parseTextNode(node, meta) {
    Component.interpRegex.lastIndex = 0
    const text = node.textContent
    const newNodes = []
    let index = 0
    let match
    do {
      match = Component.interpRegex.exec(text)
      if (!match) break
      const [raw, expr, slot] = match
      newNodes.push(
        document.createTextNode(
          text.substring(index, match.index)
        )
      )
      if (raw.charAt(0) === '{') {
        const exprNode = document.createTextNode(expr)
        meta.bindings.push({
          type: 'expr',
          node: exprNode,
          expr: expr.trim()
        })
        newNodes.push(exprNode)
      } else if (raw.charAt(0) === '[') {
        const slotNode = document.createComment(` SLOT: ${slot} `)
        meta.slots[slot || Component._primarySlot] = {
          type: 'slot',
          key: slot || '[[PRIMARY_SLOT]]',
          node: slotNode
        }
      }
      index = match.index + raw.length
    } while (match)
    newNodes.push(
      document.createTextNode(
        text.substring(index)
      )
    )
    node.replaceWith(...newNodes)
  }

  _getSlotContent(node) {
    const contents = []
    this._getSlotContentDeep(node.childNodes, contents)
    contents.push({
      key: Component._primarySlot,
      nodes: node.childNodes
    })
    return contents
  }

  _getSlotContentDeep(nodes, contents) {
    for (let node of nodes) {
      const key = node.getAttribute('slot')
      if (!key) continue
      contents.push({
        key,
        nodes: [node]
      })
      node.remove()
    }
  }

  static _isScopeProxy = Symbol('isScopeProxy')
  static _ScopeProxyPath = Symbol('ScopeProxyPath')

  _createScope() {
    const emitter = new EventTarget()
    const handler = {}
    handler.get = (target, key) => {
      if (key === Component._isScopeProxy) return true
      return target[key] || void 0
    }
    handler.set = (target, key, value) => {
      const isNonScopeProxyObject = value &&
        typeof value === 'object' &&
        !value[Component._isScopeProxy]
      if (isNonScopeProxyObject) {
        value = new Proxy(value, handler)
        const path = target[Component._ScopeProxyPath]
          ? `${target[Component._ScopeProxyPath]}.${key}`
          : key
        value[Component._ScopeProxyPath] = path
      }
      target[key] = value
      const evt = new CustomEvent('update', {
        path: target[Component._ScopeProxyPath],
        target,
        key,
        value
      })
      emitter.dispatchEvent(evt)
      return true
    }
    handler.deleteProperty = (target, key) => {
      delete target[key]
      const evt = new CustomEvent('update', {
        path: target[Component._ScopeProxyPath],
        target,
        key
      })
      emitter.dispatchEvent(evt)
      return true
    }
    handler.enumerate = (target, key) => Object.keys(target)
    handler.ownKeys = (target, key) => Object.keys(target)
    handler.has = (target, key) => key in target
    handler.defineProperty = () => { throw new Error(`Sorry, not allowed!`) }
    handler.getOwnPropertyDescriptor = () => { throw new Error(`Sorry, not allowed!`) }
    const proxy = new Proxy({
      [Component._ScopeProxyPath]: ''
    }, handler)
    return { emitter, proxy }
  }
}
