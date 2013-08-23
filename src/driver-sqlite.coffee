async = require 'async'
sqlite3 = require 'sqlite3'
Result = require './result'
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

	# General query that wraps rows in a Result object
	query: (query, params, callback) ->
		result = new Result()

		@db.all query, params, (err, data) ->
			if (!handleError(err, result, callback))
				result.success = true
				result.data = data

				callback(result)

	# Get an individual store's metadata
	getMetaData: (store, callback) ->
		sql = 'SELECT data FROM __meta WHERE `store` = ?'

		@query sql, [store], (result) ->
			if (!result.success)
				return callback(result)

			if (!result.data || !result.data.length)
				result.setError('No meta rows returned')
				return callback(result)

			try
				meta = JSON.parse(result.data[0].data)
			catch err
				result.setError("Could not parse meta JSON: #{err}")
				return callback(result)

			result.success = true
			result.data = meta
			return callback(result)

	createStore: (name, keys, callback) ->
		statements = []
		keys['__jsondata'] = 'string'
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

			# Index user-specified keys only
			if (!/^__/.test(key))
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

	save: (store, object, keys, callback) -> async.waterfall [
		(callback) => @getMetaData store, (result) ->
			if (!result.success)
				return callback(result)

			callback(null, result.data)

		(meta, callback) =>
			keyData = {}

			# Skim the object for top-level keys
			Object.keys(object).forEach (key) ->
				if (meta.keys.indexOf(key) != -1)
					keyData[":#{key}"] = object[key]

			# Allow keys param to override assumed key values
			Object.keys(keys).forEach (key) ->
				if (meta.keys.indexOf(key) != -1)
					keyData[":#{key}"] = object[key]

			# Get keynames without bind prefix
			keyNames = Object.keys(keyData).map (key) -> key.slice(1)

			# Add the serialized JSON object to the row
			keyNames.push('__jsondata')
			keyData[':__jsondata'] = JSON.stringify(object)

			# Build insert query
			sql = """
				INSERT INTO `#{store}` (
					#{keyNames.map((key) -> "`#{key}`").join ', '}
				) VALUES (
					#{keyNames.map((key) -> ":#{key}").join(', ')}
				);"
			"""

			@query sql, keyData, (result) ->
				if (!result.success)
					return callback(result)

				callback(null, result)


	], (err, result) -> callback(err || result)


module.exports = Driver
