var helper = require('./helper')
var should = require('should')
var debug = require('debug')
var http = require('http')
var tv = require('..')
var Layer = tv.Layer

describe('basics', function () {
  it('should set trace mode', function () {
    tv.traceMode = tv.addon.TRACE_ALWAYS
  })

  it('should get trace mode', function () {
    tv.traceMode.should.equal(tv.addon.TRACE_ALWAYS)
  })

  it('should set trace mode as string', function () {
    tv.traceMode = 'never'
    tv.traceMode.should.equal(tv.addon.TRACE_NEVER)

    tv.traceMode = 'always'
    tv.traceMode.should.equal(tv.addon.TRACE_ALWAYS)

    tv.traceMode = 'through'
    tv.traceMode.should.equal(tv.addon.TRACE_THROUGH)
  })

  it('should set and get sample rate', function () {
    tv.sampleRate = 100
    tv.sampleRate.should.equal(100)
  })

  it('should set sample source', function () {
    tv.sampleSource = 100
  })

  it('should get sample source', function () {
    tv.sampleSource.should.equal(100)
  })

  it('should have sugary trace mode detectors', function () {
    // Reset first
    tv.traceMode = tv.addon.TRACE_THROUGH

    tv.always.should.be.false
    tv.traceMode = tv.addon.TRACE_ALWAYS
    tv.always.should.be.true

    tv.never.should.be.false
    tv.traceMode = tv.addon.TRACE_NEVER
    tv.never.should.be.true

    tv.through.should.be.false
    tv.traceMode = tv.addon.TRACE_THROUGH
    tv.through.should.be.true
  })

  it('should get access key', function () {
    tv.accessKey.should.be.a.String
  })

  it('should set logging', function () {
    var called = false
    var real = debug.enable
    debug.enable = function () {
      called = true
      debug.enable = real
    }
    var before = tv.log
    tv.log = 'layer'
    tv.log.should.equal('layer')
    called.should.equal(true)
    tv.log = before
  })

  it('should be able to detect if it is in a trace', function () {
    tv.tracing.should.be.false
    var layer = new Layer('test')
    layer.run(function () {
      tv.tracing.should.be.true
    })
  })

  it('should support sampling', function () {
    var skipSample = tv.skipSample
    tv.skipSample = false
    tv.traceMode = 'always'
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    var s = tv.sample('test')
    s.should.not.be.false

    tv.sampleRate = 1
    var samples = []
    for (var i = 0; i < 1000; i++) {
      s = tv.sample('test')
      samples.push(!!s[0])
    }
    samples.should.containEql(false)
    tv.skipSample = skipSample
  })

  it('should not trace in through without xtrace header', function (done) {
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'through'

    var sendReport = tv.reporter.sendReport
    tv.reporter.sendReport = function (event) {
      tv.reporter.sendReport = sendReport
      done(new Error('Tried to send an event'))
    }

    var server = http.createServer(function (req, res) {
      res.end('hi')
    })

    server.listen(function () {
      var port = server.address().port
      http.get('http://localhost:' + port, function (res) {
        res.on('end', function () {
          tv.reporter.sendReport = sendReport
          done()
        })
        res.resume()
      })
    })
  })
})
