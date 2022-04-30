import Debug from 'debug'
import { jsonResponse, getDebug, getSecureRandomCode } from '../../_utils'

const debug = getDebug('blueprint:api:passwordless-login:send-code')

export async function onRequestPost({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestPost() called')
  const body = await request.json()
  const { email, targetURL } = body
  const { origin } = new URL(targetURL)
  const code = getSecureRandomCode(6)
  await env.SESSIONS.put(code, JSON.stringify(body), { expirationTtl: 60 * 5 })  // TODO: wrap in try/catch

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
  sendGridRequest.headers.set('Content-Type', 'application/json')
  const sendGridResponse = await fetch(sendGridRequest)
  // TODO: handle sendGridResponse error 404, 500, etc.

  return jsonResponse({ success: true })
}
