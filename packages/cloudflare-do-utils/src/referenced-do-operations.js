// TODO: Swith all uses of referenced-do-mixin to typeConfig and remove referenced-do-mixin
/* eslint-disable no-param-reassign */

import { throwIf } from './throws.js'
import { requestOutResponseIn } from './content-processor.js'
import { HTTPError } from './http-error.js'

export async function callDO(env, typeVersionConfig, options, expectedResponseCode, idString) {
  let id
  let url = `http://fake.host/${typeVersionConfig.type}/${typeVersionConfig.version}/`
  if (idString == null) {
    id = env[typeVersionConfig.doNamespace].newUniqueId()
  } else {
    id = env[typeVersionConfig.doNamespace].idFromString(idString)
    url += `${idString}/`
  }
  const entityStub = env[typeVersionConfig.doNamespace].get(id)
  const response = await requestOutResponseIn(url, options, entityStub)  // TODO: Pass along the cookies
  // if expectedResonseCode is null/undefined, then the calling code will check the response
  if (expectedResponseCode != null && response.status !== expectedResponseCode) {
    if (response.status >= 400) {
      throw new HTTPError(response.content.error.message, response.status, response.content)
    } else {
      throwIf(
        true,  // because we checked for expectedResponseCode above
        `Unexpected response code ${response.status} from call to ${url}`,
        response.status,
        response.content,
      )
    }
  }
  return response
}

export async function hardDeleteDO(env, typeVersionConfig, idString) {
  throwIf(idString == null, 'Required parameter, idString, missing from call to hardDeleteDO()')
  const options = {
    method: 'DELETE',
  }
  const url = `http://fake.host/transactional-do-wrapper/${idString}`
  const id = env[typeVersionConfig.doNamespace].idFromString(idString)
  const entityStub = env[typeVersionConfig.doNamespace].get(id)
  const response = await requestOutResponseIn(url, options, entityStub)  // TODO: Pass along the cookies
  if (response.status >= 400) {
    const { error } = response.content
    throwIf(
      true,
      error?.message || `Unexpected response code ${response.status} from call to ${url}`,
      response.status,
      response.content,
    )
  }
  return response
}

export function getTypeVersionConfigAndEnvironmentOptions(type, version, typeConfig, env) {
  // set the typeVersionConfig by combining the default with the specific type/version
  const typeVersionConfig = { type, version }
  const lookedUpTypeVersionConfig = typeConfig.types[type]?.versions[version] ?? {}
  const typeVersionConfigKeys = new Set([...Reflect.ownKeys(typeConfig.defaultTypeVersionConfig), ...Reflect.ownKeys(lookedUpTypeVersionConfig)])
  for (const key of typeVersionConfigKeys) {
    if (key !== 'environments') {
      typeVersionConfig[key] = lookedUpTypeVersionConfig[key] ?? typeConfig.defaultTypeVersionConfig[key]
    }
  }

  // set the environment options by combining the default with the options for the specific environment
  const environment = env?.CF_ENV ?? '*'
  const environmentOptions = {}
  const defaultEnvironmentOptions = lookedUpTypeVersionConfig.environments['*'] ?? {}
  const lookedUpEnvironmentOptions = lookedUpTypeVersionConfig.environments[environment] ?? {}
  const keys = new Set([...Reflect.ownKeys(defaultEnvironmentOptions), ...Reflect.ownKeys(lookedUpEnvironmentOptions)])
  for (const key of keys) {
    environmentOptions[key] = lookedUpEnvironmentOptions[key] ?? defaultEnvironmentOptions[key]
  }

  return { typeVersionConfig, environmentOptions }
}
