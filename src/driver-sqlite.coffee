sqlite3 = require 'sqlite3'
Result = require './result'
noop = ->

sanitize = (str) -> str.replace(/'/g, "''")

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
		meta = { keys: Object.keys(keys) }

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

		# Meta table is used to track keys (instead of querying the schema)
		statements.push """
			CREATE TABLE IF NOT EXISTS __meta(
				`id` INTEGER PRIMARY KEY,
				`store` VARCHAR(255) NOT NULL,
				`data` TEXT NOT NULL
			);
		"""

		statements.push """
			INSERT INTO __meta (`store`, `data`)
			VALUES('#{sanitize name}', '#{sanitize JSON.stringify meta}');
		"""

		# Finish CREATE TABLE for this store
		sql += '(' + columns.join(', ') + ')'
		statements.unshift(sql)

		# Wrap into transaction
		statements.unshift('BEGIN')
		statements.push('COMMIT')

		multiExec(@db, statements, callback)

module.exports = Driver
