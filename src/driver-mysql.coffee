async = require 'async'
mysql = require 'mysql'
Result = require './result'
util = require './sql-util'
noop = ->

# Escape quotes for SQLite-compatible strings
sanitize = (str) -> String(str).replace(/'/g, "\\'")

# Run multiple non-prepared statements
multiExec = (db, statements, callback) ->
  result = new Result()

  if (!(statements instanceof Array))
    statements = [statements]

  if (!callback?)
    callback = noop

  statements = statements.map (statement) -> (next) ->
    db.query statement, next

  async.series statements, (err, result) ->
    if (util.handleError(err, result, callback))
      return callback = noop

    result.success = true
    callback(result)

class Driver
  init: (config) ->
    @open(config)

Driver::open = (config) ->
  @config = config || @config
  @conn = mysql.createConnection @config

# General query that wraps rows in a Result object
Driver::query = (query, params, callback) ->
  result = new Result()

  if (typeof params == 'function')
    callback = params
    params = []

  @conn.query query, params, (err, data) ->
    if (!util.handleError(err, result, callback))
      result.success = true
      result.data = data

      callback(result)

# Execute non-query statements
Driver::exec = (statement, params, callback) ->

# Get an individual store's metadata
Driver::getMetaData = (store, callback) ->

Driver::createStore = (name, keys, callback) ->
  statements = util.createStore(name, keys, sanitize, 'AUTO_INCREMENT')
  multiExec(@conn, statements, callback)

Driver::deleteStore = (name, callback) ->

Driver::save = (store, object, keys, callback) ->

Driver::getQuery = (store, criteria, params) ->

Driver::get = (store, criteria, callback) ->

Driver::stream = (store, criteria, callback) ->

Driver::delete = (store, criteria, callback) ->

module.exports = Driver
