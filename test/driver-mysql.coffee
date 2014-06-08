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
            return callback(result.err)

          if (!result.data.length)
            return callback(new Error("No index for key: #{key}"))

          callback()

      , done)
