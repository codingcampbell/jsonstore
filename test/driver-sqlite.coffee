JSONStore = require '../src/jsonstore'

db = new JSONStore(':memory:')
keys =
	id: 'number'
	name: 'string'
keyCount = Object.keys(keys).length

db.createStore 'test', keys, (result) ->
	if (!result.success)
		throw new Error(result.error)

describe 'SQLite Driver', ->
	describe 'createStore', ->
		it 'should create an index for each key', (done) ->
			count = 0
			rowExists = (err, row) ->
				if (count < 0)
					return

				if (!row)
					count = -1
					return done(new Error("No index for key: #{this}"))

				count += 1
				if (count == keyCount)
					done()

			Object.keys(keys).forEach (key) ->
				db.driver.db.get "SELECT * FROM sqlite_master WHERE `name` = 'idx-test-#{key}'", rowExists.bind(key)

		it 'should create a column for each key', (done) ->
			db.driver.db.all 'PRAGMA table_info(test)', (err, rows) ->
				if (err)
					return done(new Error(err))

				keyNames = Object.keys(keys).filter (key) ->
					return !rows.some (row) ->
						return row.name == key

				if (keyNames.length)
					return done(new Error('No columns for keys: ' + keyNames.join(', ')))

				done()
