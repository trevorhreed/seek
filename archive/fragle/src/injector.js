export class Injector {
  constructor() {
    this.injectables = {}
  }

  add(name, injectable) {
    this.injectables[name] = injectable
  }

  find(name) {
    return this.injectables[name]
  }
}
