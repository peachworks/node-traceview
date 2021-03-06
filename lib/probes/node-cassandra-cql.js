var requirePatch = require('../require-patch')
var argsToArray = require('sliced')
var shimmer = require('shimmer')
var semver = require('semver')
var Layer = require('../layer')
var tv = require('..')
var Sanitizer = tv.addon.Sanitizer
var conf = tv['node-cassandra-cql']

module.exports = function (cassandra) {
  var pkg = requirePatch.relativeRequire('node-cassandra-cql/package.json')

  // Create reversed map of consistencies back to their names
  var types = cassandra.types
  var consistencies = {}
  Object.keys(types.consistencies).forEach(function (name) {
    var value = types.consistencies[name]
    if (typeof value === 'number') {
      consistencies[value] = name
    }
  })

  // Hack to passthrough getDefault, and also support it in 0.2.x
  consistencies.getDefault = function () {
    return this.quorum
  }.bind(types.consistencies)

  patchConnection(cassandra.Connection.prototype)
  patchClient(cassandra.Client.prototype, pkg.version, consistencies)

  return cassandra
}

function patchConnection (connection) {
  shimmer.massWrap(connection, [
    'open',
    'close',
    'authenticate',
    'prepare'
  ], function (method) {
    return function () {
      var args = argsToArray(arguments)
      var last = Layer.last
      if (last) {
        args.push(tv.requestStore.bind(args.pop()))
      }
      return method.apply(this, args)
    }
  })

  shimmer.massWrap(connection, [
    'execute',
    'executePrepared'
  ], function (method) {
    return function () {
      var args = argsToArray(arguments)

      var last = Layer.last
      if (last) {
        last.info({
          RemoteHost: this.options.host + ':' + this.options.port
        })
      }

      return method.apply(this, args)
    }
  })
}

function patchClient (client, version, consistencies) {
  var continuers = [
    'connect'
  ]

  // This is a newer thing. We don't yet instrument it,
  // but we need to propagate context through it.
  // TODO: Figure out how to report batch queries
  if (semver.satisfies(version, '>=0.4.4')) {
    continuers.push('executeBatch')
  }

  shimmer.massWrap(client, continuers, function (method) {
    return function () {
      var args = argsToArray(arguments)
      var last = Layer.last
      if (last) {
        args.push(tv.requestStore.bind(args.pop()))
      }
      return method.apply(this, args)
    }
  })

  shimmer.massWrap(client, [
    'execute',
    'executeAsPrepared'
  ], function (execute) {
    return function () {
      var args = argsToArray(arguments)
      var cb = args.pop()
      var query = args[0]
      var params = args[1] || []
      var consistency = args[2] || consistencies.getDefault()
      var self = this

      // Skip, if unable to find a trace to continue from
      var last = Layer.last
      if ( ! last) {
        return execute.apply(self, args.concat(cb))
      }

      // If disabled, just bind
      if ( ! conf.enabled) {
        return execute.apply(self, args.concat(tv.requestStore.bind(cb)))
      }

      // Create a hash to store even k/v pairs
      var data = {
        Spec: 'query',
        Flavor: 'cql',
        Keyspace: this.options.keyspace,
        ConsistencyLevel: consistencies[consistency],
        Query: query
      }

      // Keyspace is planned to be an alternative to Database.
      // For now, Database is a required key, so map it back.
      data.Database = data.Keyspace

      if (params.length && ! conf.sanitizeSql) {
        data.QueryArgs = params

      // If no args list has been supplied, assume the worst...
      } else if (conf.sanitizeSql) {
        data.Query = Sanitizer.sanitize(data.Query, Sanitizer.OBOE_SQLSANITIZE_KEEPDOUBLE)
      }

      // Serialize QueryArgs, if available
      if (data.QueryArgs) {
        // Trim large values and ensure buffers are converted to strings
        data.QueryArgs = data.QueryArgs.map(function (arg) {
          return (arg.length > 1000 ? arg.slice(0, 1000) : arg).toString()
        })
        data.QueryArgs = JSON.stringify(data.QueryArgs)
      }

      // Truncate long queries
      if (data.Query.length > 2048) {
        data.Query = data.Query.slice(0, 2048).toString()
        data.QueryTruncated = true
      }

      // Collect backtraces, if configured to do so
      if (conf.collectBacktraces) {
        data.Backtrace = tv.backtrace()
      }

      // Create and run layer
      var layer = last.descend('cassandra', data)
      return layer.run(function (wrap) {
        args.push(wrap(cb, function (err) {
          if (err && err instanceof Error) {
            err.individualErrors.forEach(function (err) {
              layer.info({
                ErrorClass: err.constructor.name,
                ErrorMsg: err.message,
                Backtrace: err.stack
              })
            })
          }
          layer.exit()
        }))

        return execute.apply(self, args)
      })
    }
  })
}
