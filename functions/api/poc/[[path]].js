// monorepo imports
import { pagesDOProxy } from '@transformation-dev/cloudflare-do-utils'

const onRequest = pagesDOProxy('GREETER')

export { onRequest }
