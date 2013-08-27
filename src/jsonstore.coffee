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

	save: (store, object, keys, callback) ->
		if (typeof store != 'string')
			throw new Error('Missing parameter: store (expected a string)')

		if (!object?)
			throw new Error('Missing parameter: object')

		# `Keys` param is optional, omitting it means callback takes its place
		if (typeof keys == 'function')
			callback = keys
			keys = {}

		if (!keys?)
			keys = {}

		if (!callback?)
			callback = noop

		@driver.save(store, object, keys, callback)

	get: (store, criteria, callback) ->
		if (typeof callback != 'function')
			callback = noop

		@driver.get(store, criteria, callback)

module.exports = JSONStore
