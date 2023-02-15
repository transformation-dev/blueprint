// monorepo imports
import { pagesDOProxy } from '@transformation-dev/cloudflare-do-utils'

const onRequest = pagesDOProxy('DO_API')

export { onRequest }
