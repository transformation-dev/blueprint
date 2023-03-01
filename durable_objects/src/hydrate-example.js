export class Hydrate {
  async hydrate() {
    if (this.hydrated) return
    this.value = await this.state.storage.get('value')
    this.hydrated = true
  }

  constructor(state, env) {
    this.state = state
    this.env = env
    this.hydrated = false
  }

  async fetch(request) {
    await this.hydrate()
    return new Response(this.value)
  }
}
