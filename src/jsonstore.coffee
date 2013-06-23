Driver = require './driver-sqlite'
noop = ->

class JSONStore
	constructor: (dbFile, customDriver) ->
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

module.exports = JSONStore
