exports.run = function (ctx, done) {
	ctx.mysql.cluster.getConnection(function (err, connection) {
		function complete (err, res) {
			connection.release()
			done(err, res)
		}

		if (err) {
			complete(err)
			return
		}

		connection.query('SELECT 1', complete)
	})
}
