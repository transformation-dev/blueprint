// This wrapper is kept simple to serve as a demonstration of the concept.
// In production, consider using the VersioningTransactionalWrapper instead.
export class TransactionalDOWrapperBase {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.classInstance = null
  }

  async fetch(request) {
    let response
    try {
      response = await this.state.storage.transaction(async (txn) => {
        const alteredState = { ...this.state, storage: txn }
        // TheClass is a static member of the subclass. It must be set there.
        if (this.classInstance == null) this.classInstance = new this.constructor.TheClass(alteredState, this.env)
        else this.classInstance.state = alteredState  // Reset for each transaction. The DO must use this.state
        return this.classInstance.fetch(request)
      })
    } catch (e) {
      this.classInstance = null  // Reset the instance so it will be rehydrated from storage on next request
      throw e  // Rethrowing to preserve the wrapped durable object's behavior.
    }
    return response
  }
}
