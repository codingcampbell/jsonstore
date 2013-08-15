Driver = require './driver-sqlite'
noop = ->

class JSONStore
	constructor: (dbFile, customDriver) ->
		if (!dbFile?)
			throw new Error('Missing parameter: dbFile')

		@driver = customDriver || new Driver()
		@driver.init(dbFile)

	createStore: (name, keys, callback) ->
		if (!name?)
			throw new Error('Missing parameter: name')

		if (!keys?)
			throw new Error('Missing parameter: keys')

		if (!callback?)
			callback = noop

		Object.keys(keys).forEach (key) ->
			keys[key] = String(keys[key]).toLowerCase()

			if (keys[key] != 'string' && keys[key] != 'number')
				keys[key] = 'string'

		@driver.createStore(String(name), keys, callback)

	query: (store, criteria, callback) ->
		@driver.query(store, criteria, callback)

module.exports = JSONStore
