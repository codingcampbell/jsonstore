mysql = require 'mysql'
JSONStore = require '../src/jsonstore'
MysqlDriver = require '../src/driver-mysql'
async = require 'async'

config =
  host: 'localhost'
  user: 'root'
  password: ''
  database: 'jsonstore_test'

db = new JSONStore(config, new MysqlDriver())

keys =
  id: 'number'
  name: 'string'
keyCount = Object.keys(keys).length

testData = ['Mario', 'Luigi', 'Peach', 'Toad', 'Bowser']

insertArray = (data, callback) ->
  inserts = data.map (name) ->
    (callback) ->
      db.save 'test', {name: name}, (result) ->
        if (!result.success)
          return callback(result)

        callback(null, result)

  async.series inserts, callback

initDb = (done) -> async.series [
  # Create database
  (callback) ->
    tmpConn = mysql.createConnection config
    tmpConn.query "drop database #{config.database}", (err, data) ->
      if (err)
        return callback(err)

      tmpConn.query "create database #{config.database}", (err, data) ->
        tmpConn.destroy()
        callback(err || null)

  # Create object store
  (callback) ->
    db.createStore 'test', keys, (result) ->
      callback(result.error || null)
], (err) -> done(err)

describe 'MySQL Driver', ->
  before(initDb)

  describe 'createStore', ->
    it 'should create an index for each key', (done) ->
      async.each(Object.keys(keys), (key, callback) ->
        # Don't check non-user keys
        if (/^__/.test(key))
          return callback()

        query = """
          SELECT index_name
          FROM information_schema.statistics
          WHERE table_schema = '#{config.database}'
          AND table_name = 'test'
          AND index_name = 'idx-test-#{key}'
        """

        db.driver.query query, (result) ->
          if (!result.success)
            return callback(result.error)

          if (!result.data.length)
            return callback(new Error("No index for key: #{key}"))

          callback()

      , done)

    it 'should create a column for each key', (done) ->
      db.driver.query 'SHOW COLUMNS FROM test', (result) ->
        if (!result.success)
          return done(result.error)

        rows = result.data

        keyNames = Object.keys(keys).filter (key) ->
          return !rows.some (row) ->
            return row.Field == key

        if (!keyNames.length)
          return done()

        done(new Error('No columns for keys: ' + keyNames.join(', ')))

    it 'should create a __meta table if one does not exist', (done) ->
      db.driver.query 'SHOW TABLE STATUS', (result) ->
        if (!result.success)
          return done(result.error)

        hasTable = result.data.some((row) -> row.Name == '__meta')

        if (!hasTable)
          return done(new Error('No __meta table found'))

        done()

    it 'should store key information in the __meta table', (done) ->
      db.driver.query "SELECT data FROM __meta WHERE `store` = 'test'", (result) ->
        keyNames = Object.keys(keys).filter (key) -> !/^__/.test(key)

        if (result.error)
          return done(new Error(result.error))

        row = result.data[0]

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

        db.driver.query 'SHOW COLUMNS FROM testNoId', (result) ->
          if (result.error)
            return done(new Error(result.error))

          rows = result.data

          if (!rows || !rows.some)
            return done(new Error('No columns found'))

          if (rows.some (row) -> row.Field == 'id')
            return done()

          done(new Error('id column not found'))

  describe 'save', ->
    id = null
    newValue = null
    checkNewValue = (done) -> (result) ->
      query = 'select * from testNoId where id = ?'

      db.driver.query query, [id], (result) ->
        if (!result.success)
          return done(new Error(result.error))

        row = result.data[0]

        if (!row)
          return done(new Error("No rows returned"))

        if (row.foo == newValue)
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

    it 'should save an array of test data', (done) ->
      insertArray testData, (err, result) ->
        if (err)
          return done(err)

        db.get 'test', (result) ->
          if (!result.success)
            return done(result.error)

          if (!result.data.length)
            return done(new Error('No data after save'))

          done()
