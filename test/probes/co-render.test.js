var helper = require('../helper')
var tv = helper.tv

// Check for generator support
var canGenerator = false
try {
  eval('(function* () {})()')
  canGenerator = true
} catch (e) {
}

function noop () {}

describe('probes/co-render', function () {
  var emitter
  var tests = canGenerator && require('./koa')

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    tv.fs.enabled = false
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    tv.fs.enabled = true
    emitter.close(done)
  })

  //
  // Tests
  //
  if ( ! canGenerator) {
    it.skip('should support co-render', noop)
    it.skip('should skip when disabled', noop)
    it.skip('should include RUM scripts', noop)
  } else {
    it('should support co-render', function (done) {
      tests.render(emitter, done)
    })
    it('should skip when disabled', function (done) {
      tests.render_disabled(emitter, done)
    })
    it('should include RUM scripts', function (done) {
      tests.rum(emitter, done)
    })
  }
})
