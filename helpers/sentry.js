const log = require('../libs/logger')
const Raven = require('raven')
const getDomain = require('./cozy-domain')

let isRavenConfigured = false


const domainToEnv = {
  'cozy.tools': 'development',
  'cozy.works': 'development',
  'cozy.rocks': 'production',
  'mycozy.cloud': 'production'
}

const getEnvironmentFromDomain = domain => {
  return domainToEnv[domain] || 'selfhost'
}

// Available in Projet > Settings > Client Keys
// Example : https://5f94cb7772deadbeef123456:39e4e34fdeadbeef123456a9ae31caba74c@sentry.cozycloud.cc/12
const SENTRY_DSN = process.env.SENTRY_DSN

const afterFatalError = function (err, sendErr, eventId) {
  if (!sendErr) {
    log('info', 'Successfully sent fatal error with eventId ' + eventId + ' to Sentry');
  }
  process.exit(1);
}

const afterCaptureException = function (sendErr, eventId) {
  if (!sendErr) {
    log('info', 'Successfully sent exception with eventId ' + eventId + ' to Sentry');
  }
  process.exit(1)
}

const setupSentry = function () {
  try {
    log('info', 'process.env.SENTRY_DSN found, setting up Raven')
    const release = typeof GIT_SHA !== 'undefined' ? GIT_SHA : 'dev'
    const domain = getDomain()
    const environment = getEnvironmentFromDomain(domain)
    Raven.config(SENTRY_DSN, { release, environment }).install(afterFatalError)
    Raven.mergeContext({ extra: {domain} })
    isRavenConfigured = true
    log('info', 'Raven configured !')
  } catch (e) {
    log('warn', 'Could not load Raven, errors will not be sent to Sentry')
    log('warn', e)
  }
}

module.exports.captureExceptionAndDie = function (err) {
  log('info', 'Capture exception and die')
  if (!isRavenConfigured) {
    process.exit(1)
  } else {
    try {
      log('info', 'Sending exception to Sentry')
      Raven.captureException(err, afterCaptureException)
    } catch (e) {
      log('warn', 'Could not send error to Sentry, exiting...')
      log('warn', e)
      log('warn', err)
      process.exit(1)
    }
  }
}

module.exports.wrapIfSentrySetUp = function (obj, method) {
  if (SENTRY_DSN) {
    obj[method] = Raven.wrap(obj[method])
  }
}

if (SENTRY_DSN) {
  setupSentry()
}
