sqlite3 = require 'sqlite3'
Result = require './result'
util = require './sql-util'
noop = ->

# Escape quotes for SQLite-compatible strings
sanitize = (str) -> String(str).replace(/'/g, "''")

# Common handling for (most) errors
handleError = (error, result, callback) ->
	if (error)
		result.error = error
		callback(result)
		return true

	return false

# Run multiple non-prepared statements
multiExec = (db, statements, callback) ->
	result = new Result()

	if (!(statements instanceof Array))
		statements = [statements]

	if (!callback?)
		callback = noop

	db.serialize ->
		db.exec statements.join('; '), (error) ->
			if (handleError(error, result, callback))
				return callback = noop

			result.success = true
			callback(result)

class Driver
	init: (dbFile) ->
		@db = new sqlite3.Database(dbFile)

	createStore: (name, keys, callback) ->
		statements = []
		sql = "CREATE TABLE `#{name}`"
		columns = []

		Object.keys(keys).forEach (key) ->
			column = "`#{key}` "

			if (keys[key] == 'number')
				column += 'INTEGER'
			else
				column += 'TEXT'

			columns.push(column)
			statements.push """
				CREATE INDEX `idx-#{name}-#{key}` ON `#{name}`(`#{key}`)
			"""

		sql += '(' + columns.join(', ') + ')'

		statements.unshift(sql)
		statements.unshift('BEGIN')
		statements.push('COMMIT')

		multiExec(@db, statements, callback)

	query: (store, criteria, callback) ->
		query = 'WHERE' + util.buildCriteria(criteria, sanitize)
		console.log(query)

module.exports = Driver
