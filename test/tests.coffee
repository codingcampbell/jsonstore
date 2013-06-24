JSONStore = require '../src/jsonstore'

describe 'createStore', ->
	it 'should reject missing `name` parameter', () ->
		db = new JSONStore(':memory:')
		(-> db.createStore()).should.throwError()
