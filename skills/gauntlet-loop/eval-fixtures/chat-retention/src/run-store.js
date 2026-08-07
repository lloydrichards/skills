export class RunStore {
  #runs = new Map()

  start(id) {
    this.#runs.set(id, { id, status: "active", events: [] })
  }

  append(id, event) {
    this.#runs.get(id)?.events.push(event)
  }

  complete(id) {
    const run = this.#runs.get(id)
    if (run) {
      run.status = "complete"
    }
  }

  get(id) {
    return this.#runs.get(id)
  }
}
