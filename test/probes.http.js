var debug = require('debug')('probes-http')
var helper = require('./helper')
var should = require('should')
var oboe = require('..')
var addon = oboe.addon

var request = require('request')
var http = require('http')

function noop () {}

describe('probes.http', function () {
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    oboe.sampleRate = oboe.addon.MAX_SAMPLE_RATE
    oboe.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  //
  // Generic message checkers for response events
  //
  var checkers = {
    'http-response-write-entry': function (msg) {
      msg.should.match(new RegExp('Layer\\W*http-response-write', 'i'))
      msg.should.match(/Label\W*entry/)
    },
    'http-response-write-exit': function (msg) {
      msg.should.match(new RegExp('Layer\\W*http-response-write', 'i'))
      msg.should.match(/Label\W*exit/)
    },
    'http-response-end-entry': function (msg) {
      msg.should.match(new RegExp('Layer\\W*http-response-end', 'i'))
      msg.should.match(/Label\W*entry/)
    },
    'http-response-end-exit': function (msg) {
      msg.should.match(new RegExp('Layer\\W*http-response-end', 'i'))
      msg.should.match(/Label\W*exit/)
    },
  }

  //
  // Test a simple res.end() call in an http server
  //
  it('should send traces for http routing and response layers', function (done) {
    var server = http.createServer(function (req, res) {
      debug('request started')
      res.end('done')
    })

    var checks = [
      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(/Label\W*entry/)
        debug('entry is valid')
      },

      // checkers['http-response-end-entry'],
      // checkers['http-response-write-entry'],
      // checkers['http-response-write-exit'],
      // checkers['http-response-end-exit'],

      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(/Label\W*exit/)
        debug('exit is valid')

        emitter.removeAllListeners('message')
        server.close(done)
      }
    ]

    emitter.on('message', function (msg) {
      checks.shift()(msg.toString())
    })

    server.listen(function () {
      var port = server.address().port
      debug('test server listening on port ' + port)
      request('http://localhost:' + port)
    })
  })

  //
  // Test multiple writes to the response in an http server
  //
  it('should send traces for each write to response stream', function (done) {
    var server = http.createServer(function (req, res) {
      debug('request started')
      res.write('wait...')
      res.end('done')
    })

    var checks = [
      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(/Label\W*entry/)
        debug('entry is valid')
      },

      // checkers['http-response-write-entry'],
      // checkers['http-response-write-exit'],

      // Note that, if the stream has been writtern to already,
      // calls to end will defer to calling write before ending
      // checkers['http-response-end-entry'],
      // checkers['http-response-write-entry'],
      // checkers['http-response-write-exit'],
      // checkers['http-response-end-exit'],

      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(/Label\W*exit/)
        debug('exit is valid')

        emitter.removeAllListeners('message')
        server.close(done)
      }
    ]

    emitter.on('message', function (msg) {
      checks.shift()(msg.toString())
    })

    server.listen(function () {
      var port = server.address().port
      debug('test server listening on port ' + port)
      request('http://localhost:' + port)
    })
  })

  it('should continue tracing when receiving an xtrace id header', function (done) {
    var server = http.createServer(function (req, res) {
      debug('request started')
      res.end('done')
    })

    var origin = new oboe.Event()

    var checks = [
      function (msg) {
        msg.should.match(new RegExp('Layer\\W*http', 'i'))
        msg.should.match(new RegExp('Edge\\W*' + origin.opId, 'i'))
        msg.should.match(/Label\W*entry/)
        debug('entry is valid')
      }
    ]

    emitter.on('message', function (msg) {
      var check = checks.shift()
      if (check) {
        check(msg.toString())
      }

      if ( ! checks.length) {
        emitter.removeAllListeners('message')
        server.close(done)
      }
    })

    server.listen(function () {
      var port = server.address().port
      debug('test server listening on port ' + port)
      var options = {
        url: 'http://localhost:' + port,
        headers: {
          'X-Trace': origin.toString()
        }
      }
      request(options)
    })
  })

  //
  // Validate the various headers that get passed through to the event
  //
  var passthroughHeaders = {
    'X-Forwarded-For': 'Forwarded-For',
    'X-Forwarded-Host': 'Forwarded-Host',
    'X-Forwarded-Port': 'Forwarded-Port',
    'X-Forwarded-Proto': 'Forwarded-Proto',
    'X-Request-Start': 'Request-Start',
    'X-Queue-Start': 'Request-Start',
    'X-Queue-Time': 'Queue-Time'
  }

  Object.keys(passthroughHeaders).forEach(function (key) {
    var val = passthroughHeaders[key]

    var headers = {}
    headers[key] = 'test'

    it('should map ' + key + ' header to event.' + val, function (done) {
      var server = http.createServer(function (req, res) {
        debug('request started')
        res.end('done')
      })

      var checks = [
        function (msg) {
          msg.should.match(new RegExp('Layer\\W*http', 'i'))
          msg.should.match(new RegExp(val + '\\W*test', 'i'))
          msg.should.match(/Label\W*entry/)
          debug('entry is valid')
        }
      ]

      emitter.on('message', function (msg) {
        var check = checks.shift()
        if (check) {
          check(msg.toString())
        }

        if ( ! checks.length) {
          emitter.removeAllListeners('message')
          server.close(done)
        }
      })

      server.listen(function () {
        var port = server.address().port
        debug('test server listening on port ' + port)
        var options = {
          url: 'http://localhost:' + port,
          headers: headers
        }
        request(options)
      })
    })
  })

})