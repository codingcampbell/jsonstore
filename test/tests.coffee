JSONStore = require '../src/jsonstore'

describe 'JSONStore', ->
	describe 'constructor', ->
		it 'should reject missing `dbFile` parameter', ->
			(-> new JSONStore()).should.throwError(/dbFile/)

	describe 'createStore', ->
		db = new JSONStore(':memory:')
		it 'should reject missing `name` parameter', ->
			(-> db.createStore()).should.throwError(/name/)

		it 'should reject missing `keys` parameter', ->
			(-> db.createStore('name')).should.throwError(/keys/)
