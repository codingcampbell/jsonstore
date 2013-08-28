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
					# Only throw error if this key was not user-specified
					if (!/^__/.test(this))
						count = -1
						return done(new Error("No index for key: #{this}"))

				count += 1
				if (count == keyCount)
					done()

			Object.keys(keys).forEach (key) ->
				query = """
					SELECT * FROM sqlite_master WHERE `name` = 'idx-test-#{key}'
				"""
				db.driver.db.get query, rowExists.bind(key)

		it 'should create a column for each key', (done) ->
			db.driver.db.all 'PRAGMA table_info(test)', (err, rows) ->
				if (err)
					return done(new Error(err))

				keyNames = Object.keys(keys).filter (key) ->
					return !rows.some (row) ->
						return row.name == key

				if (!keyNames.length)
					return done()

				done(new Error('No columns for keys: ' + keyNames.join(', ')))

		it 'should create a __meta table if one does not exist', (done) ->
			db.driver.db.all 'PRAGMA table_info(__meta)', (err, rows) ->
				if (err)
					return done(new Error(err))

				if (!rows || !rows.length)
					return done(new Error('No __meta table found'))

				done()

		it 'should store key information in the __meta table', (done) ->
			query = "SELECT data FROM __meta WHERE `store` = 'test'"

			db.driver.db.get query, (err, row) ->
				keyNames = Object.keys(keys).filter (key) -> !/^__/.test(key)

				if (err)
					return done(new Error(err))

				try
					data = JSON.parse(row.data)
				catch err
					return done(new Error("Could not parse JSON: #{err}"))

				if (!data || !data.keys)
					return done(new Error('Could not find key data'))


				if (keyNames.join(',') != data.keys.join(','))
					return done(new Error('Key data does not match'))

				done()

		it 'should create an `id` key/column if it is omitted', (done) ->
			db.createStore 'testNoId', { foo: 'string' }, (result) ->
				if (!result.success)
					return done(new Error(result.error))

			db.driver.db.all 'PRAGMA table_info(testNoId)', (err, rows) ->
				if (err)
					return done(new Error(result.error))

				if (!rows || !rows.some)
					return done(new Error('No columns found'))

				if (rows.some (row) -> row.name == 'id')
					return done()

				done(new Error('id column not found'))

	describe 'save', ->
		id = null
		newValue = null
		checkNewValue = (done) -> (result) ->
			query = 'select * from testNoId where id = ?'

			db.driver.db.get query, id, (err, result) ->
				if (err)
					return done(new Error(err))

				if (!result)
					return done(new Error("No rows returned"))

				if (result.foo == newValue)
					return done()

				done(new Error("Expected `foo` to be: #{newValue}"))

		it 'should add `id` to object if it is omitted', (done) ->
			db.save 'testNoId', { foo: 'bar' }, (result) ->
				if (!result.success)
					return done(new Error(result.error))

				if (typeof result.data.id == 'undefined')
					return done(new Error('`id` property missing from object'))

				id = result.data.id
				done()

		it 'should replace object when saving with an existing `id`', (done) ->
			newValue = 'newBar'

			db.save 'testNoId', { id: id, foo: newValue }, checkNewValue(done)

		it 'should override object values with `keys` parameter', (done) ->
			newValue = 'overrideBar'
			object = { id: id, foo: 'bar' }

			db.save 'testNoId', object, { foo: newValue }, checkNewValue(done)
