import Debug from 'debug'
import { customAlphabet as customAlphabetNonSecure } from 'nanoid/non-secure'
import { customAlphabet } from 'nanoid'

import { jsonResponse, getDebug } from '../../_utils'

const debug = getDebug('blueprint:api:passwordless-login:send-code')

export async function onRequestPost({ request, env, params }) {
  Debug.enable(env.DEBUG)
  if (!(
    env.CF_ENV === 'production'
    || (
      typeof env.SENDGRID_LOGIN === 'string'
      && env.SENDGRID_LOGIN.length > 0
    ))
  ) {
    throw new Error('*** ERROR!!! TESTING_OVERRIDE_CODE is expected in non-production environments for testing ***')
  }
  debug('onRequestPost() called')
  const body = await request.json()
  const { email, targetURL } = body
  if (!email) {  // TODO: upgrade this with a real email validator
    return jsonResponse({ success: false, message: 'Invalid email', messageType: 'warning' })
  }
  const { origin } = new URL(targetURL)
  let code
  if (env.CF_ENV === 'production') {
    code = customAlphabet('1234567890', 6)()
  } else {
    code = customAlphabetNonSecure('1234567890', 6)()
  }
  const CODE_LIFE_IN_MINUTES = 10
  await env.SESSIONS.put(code, JSON.stringify(body), { expirationTtl: 60 * CODE_LIFE_IN_MINUTES })  // TODO: wrap in try/catch

  // call SendGrid to send email
  const sendGridBody = {
    from: {
      email: 'Larry@Transformation.dev',
    },
    personalizations: [
      {
        to: [{ email }],
        dynamic_template_data: { code, origin },
      },
    ],
    template_id: 'd-458a6b3bea1d403eb768f9469b6c80a5',
  }
  const sendGridRequest = new Request('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    body: JSON.stringify(sendGridBody),
  })
  sendGridRequest.headers.set('Authorization', `Bearer ${env.SENDGRID_LOGIN}`)
  sendGridRequest.headers.set('Content-Type', 'application/json; charset=utf-8')
  const sendGridResponse = await fetch(sendGridRequest)
  if (sendGridResponse.status !== 202) {
    return jsonResponse({ success: false, message: 'Email not sent. Try again.', messageType: 'warning' })
  }
  // TODO: handle sendGridResponse error 404, 500, etc.

  return jsonResponse({ success: true, message: `Code sent. Valid for ${CODE_LIFE_IN_MINUTES} minutes.`, messageType: 'success' })
}
