var fs = require('fs')
var gulp = require('gulp')
var mocha = require('gulp-mocha')
var matcha = require('gulp-matcha')
var yuidoc = require('gulp-yuidoc')
var istanbul = require('gulp-istanbul')
var spawn = require('child_process').spawn
var pkg = require('./package')

// Describe basic tasks and their associated files
var tasks = {
  unit: {
    lib: 'lib/*.js',
    test: 'test/*.test.js',
    bench: 'test/*.bench.js',
  },
  probes: {
    lib: 'lib/probes/*.js',
    test: 'test/probes/*.test.js',
    bench: 'test/probes/*.bench.js',
  }
}

// Describe probe tasks automatically
var probes = fs.readdirSync('lib/probes')
probes.forEach(function (probe) {
  var name = probe.replace(/\.js$/, '')
  var task = tasks['probe:' + name] = {
    lib: 'lib/probes/' + probe
  }

  var test = 'test/probes/' + name + '.test.js'
  if (fs.existsSync(test)) {
    task.test = test
  }

  var bench = 'test/probes/' + name + '.bench.js'
  if (fs.existsSync(bench)) {
    task.bench = bench
  }
})

// Create test tasks
makeTestTask('test', 'test/**/*.test.js')
Object.keys(tasks).forEach(function (name) {
  var task = tasks[name]
  if (task.test) {
    makeTestTask('test:' + name, task.test)
  }
})

// Create coverage tasks
makeCoverageTask('coverage', 'test/**/*.test.js')
Object.keys(tasks).forEach(function (name) {
  var task = tasks[name]
  if (task.test) {
    makeCoverageTask('coverage:' + name, task.test, task.lib)
  }
})

// Create benchmark tasks
makeBenchTask('bench', 'test/**/*.bench.js')
Object.keys(tasks).forEach(function (name) {
  var task = tasks[name]
  if (task.bench) {
    makeBenchTask('bench:' + name, task.bench)
  }
})

// Create support-matrix tasks
require('./test/versions')
  .map(function (mod) { return mod.name })
  .forEach(makeMatrixTask)

gulp.task('support-matrix', function () {
  return spawn('alltheversions', ['--verbose'], {
    stdio: 'inherit'
  })
})

// Create auto-docs task
gulp.task('docs', function () {
  return gulp.src('lib/**/*.js')
    .pipe(yuidoc({
      project: {
        name: pkg.name,
        description: pkg.description,
        version: pkg.version,
        url: 'http://appneta.com'
      }
    }))
    .pipe(gulp.dest('./docs'))
})

// Create watcher task
gulp.task('watch', function () {
  Object.keys(tasks).forEach(function (name) {
    if (name === 'probes') return
    var task = tasks[name]

    // These spawns tasks in a child processes. This is useful for
    // preventing state persistence between runs in a watcher and
    // for preventing crashes or exits from ending the watcher.
    function coverage () {
      return spawn('gulp', ['coverage:' + name], {
        stdio: 'inherit'
      })
    }

    function bench () {
      return spawn('gulp', ['bench:' + name], {
        stdio: 'inherit'
      })
    }

    function sequence (steps) {
      function next() {
        var step = steps.shift()
        var v = step()
        if (steps.length) {
          v.on('close', next)
        }
        return v
      }
      return next()
    }

    gulp.watch([ task.lib ], function () {
      var steps = []
      if (task.test) steps.push(coverage)
      if (task.bench) steps.push(bench)
      return sequence(steps)
    })

    if (task.test) {
      gulp.watch([ task.test ], coverage)
    }

    if (task.bench) {
      gulp.watch([ task.bench ], bench)
    }
  })
})

// Set default task to run the watcher
gulp.task('default', [
  'watch'
])

//
// Helpers
//

function tester () {
  require('./')
  require('should')

  return mocha({
    reporter: 'spec',
    timeout: 5000
  })
  .once('error', function (e) {
    console.error(e.stack)
    process.exit(1)
  })
}

function makeBenchTask (name, files) {
  gulp.task(name, function (done) {
    var helper = require('./test/helper')

    var tv = helper.tv
    tv.sampleRate = tv.addon.MAX_SAMPLE_RATE
    tv.traceMode = 'always'

    global.tracelyzer = helper.tracelyzer(function () {
      gulp.src(files, {
        read: false
      })
      .pipe(matcha())
      .once('end', process.exit)
    })
  })
}

function makeTestTask (name, files) {
  gulp.task(name, function () {
    return gulp.src(files, {
      read: false
    })
    .pipe(tester())
    .once('end', process.exit)
  })
}

function makeCoverageTask (name, files, libs) {
  libs = libs || 'lib/**/*.js'

  gulp.task('pre-' + name, function () {
    return gulp.src(libs)
      .pipe(istanbul())
      .pipe(istanbul.hookRequire())
  })

  gulp.task(name, ['pre-' + name], function () {
    return gulp.src(files)
      .pipe(tester())
      .pipe(istanbul.writeReports({
        dir: './coverage/' + name
      }))
      .pipe(istanbul.enforceThresholds({
        // TODO: 70% is kind of...bad.
        thresholds: { global: 70 }
      }))
      .once('end', process.exit)
  })
}

function makeMatrixTask (name) {
  gulp.task('support-matrix:' + name, function () {
    return spawn('alltheversions', [
      '--module', name,
      '--verbose'
    ], {
      stdio: 'inherit'
    })
  })
}
