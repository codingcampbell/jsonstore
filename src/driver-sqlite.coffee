sqlite3 = require 'sqlite3'
Result = require './result'
noop = ->

opMap =
	gt: '>'
	lt: '<'
	eq: '='
	ne: '!='

sanitize = (input) -> input.replace(/"/g, '\\"')

buildCriteria = (criteria, sub) ->
	if (!criteria.and? && !criteria.or?)
		if (criteria.constructor != Array)
			criteria = [criteria]

		criteria = { 'and': criteria }

	console.log(criteria)

	mode = 'and'

	if (criteria.or?)
		mode = 'or'

	list = criteria[mode]

	result = ' ('
	if (sub)
		result = ' ' + mode.toUpperCase() + result

	return result + (list.map (condition) ->
		op = opMap[condition.op] ? '='

		if (condition.value == null)
			op = 'IS'

			if (condition.op == 'ne')
				op = 'IS NOT'

			# Unescaped NULL for SQL
			value = 'NULL'
		else
			value = '"' + sanitize(condition.value) + '"'

		if (condition.and?)
			value += buildCriteria(condition.and, true)
		else if (condition.or?)
			value += buildCriteria(condition.or, true)

		return "(`#{condition.key}` #{op} #{value})"
	).join(' ' + mode.toUpperCase() + ' ') + ')'

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
		query = 'WHERE' + buildCriteria(criteria)
		console.log(query)

module.exports = Driver
