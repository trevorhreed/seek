import { Injector } from './injector.js'
import { Component } from './component.js'

export default class Fragle {

  constructor() {
    this.injector = new Injector()
    this.components = {}
    this.selectors = []
  }

  inject(name, injectable) {
    if (name.charAt === '$') {
      throw new Error(`Injectable name cannot start with '$'. Found ${name}!`)
    }
    this.injector.add(name, injectable)
  }

  component({
    selector,
    styles,
    template,
    main
  }) {
    if (this.components[selector]) {
      throw new Error(`Duplicate component selector: '${selector}'.`)
    }
    this.nodeRefs = []
    this.selectors.push(selector)
    this.components[selector] = new Component({
      selector,
      styles,
      template,
      main
    })
  }

  initialize(selector) {
    if (this.root) console.error(`Already initialized!`)
    this.rootNode = document.querySelector(selector)
    this._compileNodes([this.rootNode])

    this.observer = new MutationObserver(changes => {
      for (let change of changes) {
        if (change.type !== 'childList') continue
        const { removedNodes } = change
        for (let removed of removedNodes) {
          for (let nodeRef of this.nodeRefs) {
            if (removed.isSameNode(nodeRef.node)) {
              unbind()
              break
            }
          }
        }
      }
    })
    this.observer.observe(this.rootNode, {
      subtree: true,
      childList: true
    })
  }

  _compileNodes(nodes) {
    if (!nodes || !nodes.length) return
    for (let node of nodes) {
      if (node.nodeType !== 1) continue
      this._compileNodes(node.childNodes)
      for (let selector of this.selectors) {
        if (node.matches(selector)) {
          const unbind = this.components[selector]
            .initialize(node, this.injector)
          this._compileNodes(node.childNodes)
          this.nodeRefs.push({ node, unbind })
          break
        }
      }
    }
  }

}
