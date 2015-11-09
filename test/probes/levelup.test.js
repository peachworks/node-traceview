var helper = require('../helper')
var tv = helper.tv
var addon = tv.addon

var should = require('should')

var request = require('request')
var http = require('http')

// NOTE: requiring leveldown is necessary as the one that works with
// node 0.11 does not match the one in the devDependencies of levelup.
var level = require('levelup')
var db = level('./test-db', {
  db: require('leveldown')
})

describe('probes.levelup', function () {
  var ctx = { levelup: db }
  var emitter

  //
  // Intercept tracelyzer messages for analysis
  //
  before(function (done) {
    emitter = helper.tracelyzer(done)
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'
  })
  after(function (done) {
    emitter.close(done)
  })

  var check = {
    'levelup-entry': function (msg) {
      msg.should.have.property('Layer', 'levelup')
      msg.should.have.property('Label', 'entry')
    },
    'levelup-exit': function (msg) {
      msg.should.have.property('Layer', 'levelup')
      msg.should.have.property('Label', 'exit')
    }
  }

  it('should support put', function (done) {
    helper.test(emitter, function (done) {
      db.put('foo', 'bar', done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'put')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        check['levelup-exit'](msg)
      }
    ], done)
  })

  it('should support get', function (done) {
    helper.test(emitter, function (done) {
      db.get('foo', done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'get')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        msg.should.have.property('KVHit')
        check['levelup-exit'](msg)
      }
    ], done)
  })

  it('should support del', function (done) {
    helper.test(emitter, function (done) {
      db.del('foo', done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'del')
        msg.should.have.property('KVKey', 'foo')
      },
      function (msg) {
        check['levelup-exit'](msg)
      }
    ], done)
  })

  it('should support array batch', function (done) {
    helper.test(emitter, function (done) {
      db.batch([
        { type: 'put', key: 'foo', value: 'bar' },
        { type: 'del', key: 'foo' },
      ], done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'batch')
        msg.should.have.property('KVKeys', '["foo","foo"]')
        msg.should.have.property('KVOps', '["put","del"]')
      },
      function (msg) {
        check['levelup-exit'](msg)
      }
    ], done)
  })

  it('should support chained batch', function (done) {
    helper.test(emitter, function (done) {
      db.batch()
        .put('foo', 'bar')
        .del('foo')
        .write(done)
    }, [
      function (msg) {
        check['levelup-entry'](msg)
        msg.should.have.property('KVOp', 'batch')
        msg.should.have.property('KVKeys', '["foo","foo"]')
        msg.should.have.property('KVOps', '["put","del"]')
      },
      function (msg) {
        check['levelup-exit'](msg)
      }
    ], done)
  })
})
