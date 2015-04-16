async = require 'async'
mysql = require 'mysql'
Result = require './result'
util = require './sql-util'
noop = ->

# Escape quotes for MySQL-compatible strings
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
Driver::getMetaData =  (store, callback) ->
  sql = 'SELECT data FROM __meta WHERE `store` = ?'

  @query sql, [store], (result) ->

    if (!result.success)
      return callback(result)

    if (!result.data || !result.data.length)
      result.setError('No meta rows returned')
      return callback(result)

    try
      meta = JSON.parse(result.data[0].data)
    catch err
      result.setError("Could not parse meta JSON: #{err}")
      return callback(result)

    result.success = true
    result.data = meta
    return callback(result)

Driver::createStore = (name, keys, callback) ->
  statements = util.createStore(name, keys, sanitize, 'AUTO_INCREMENT')
  multiExec(@conn, statements, callback)

Driver::deleteStore = (name, callback) ->
  statements = [
    'START TRANSACTION'
    "DELETE FROM __meta WHERE `store` = '#{sanitize name}'"
    "DROP TABLE #{sanitize name}"
    'COMMIT'
  ]

  multiExec @conn, statements, callback

Driver::save = (store, object, keys, callback) -> async.waterfall [
  # Begin transaction
  (callback) => @query 'START TRANSACTION', -> callback(null)

  # Get key schema from metadata
  (callback) => @getMetaData store, (result) ->
    if (!result.success)
      return callback(result)

    callback(null, result.data)

  # Insert data
  (meta, callback) =>
    keyData = {}

    # Skim the object for top-level keys
    Object.keys(object).forEach (key) ->
      if (meta.keys.indexOf(key) != -1)
        keyData[key] = object[key]

    # Allow keys param to override assumed key values
    Object.keys(keys).forEach (key) ->
      if (meta.keys.indexOf(key) != -1)
        keyData[key] = keys[key]

    # Make sure an overidden ID key makes it into the object
    if (typeof keys.id != 'undefined')
      object.id = keys.id

    keyNames = Object.keys(keyData)

    # Add the serialized JSON object to the row
    keyNames.push('__jsondata')
    keyData['__jsondata'] = JSON.stringify(object)

    # Build insert query
    sql = """
      REPLACE INTO `#{store}` (
        #{keyNames.map((key) -> "`#{key}`").join ', '}
      ) VALUES (
        #{keyNames.map((key) -> '?').join ', '}
      );
    """

    paramValues = keyNames.map((key) -> keyData[key])

    # Execute insert statement
    @query sql, paramValues, (result) =>
      if (!result.success)
        return callback(result)

      # If object does not have an ID key, we take
      # the ID generated by MySQL, modify the object to include it,
      # and re-save the modified object.
      if (typeof keyData['id'] == 'undefined')
        if (typeof result.data.insertId != 'undefined')
          object.id = result.data.insertId
          return @save(store, object, keys, (result) -> callback(null, result))

        result.setError('No ID key found in object or from MySQL')
        return callback(result)

      result.data = object
      callback(null, result)

  # Process result and notify callbacks of errors
  (result, callback) ->
    if (!result.success)
      return callback(result)

    callback(null, result)

  # End transaction
  (result, callback) => @query 'COMMIT', -> callback(null, result)

], (err, result) -> callback(err || result)

Driver::getQuery = (store, criteria, params) ->
  sql = "SELECT __jsondata FROM #{store}" + util.expandCriteria(criteria, sanitize, params)

  return sql

Driver::get = (store, criteria, callback) ->
  params = []
  @query @getQuery(store, criteria, params), params, (result) ->
    if (!result.success)
      return callback(result)

    if (!result.data)
      result.setError('No JSON data returned')
      return callback(result)

    try
      result.data = JSON.parse("""
        [#{result.data.map((r) -> r['__jsondata']).join(',')}]
      """)
    catch err
      result.setError(err)
      return callback(result)

    callback(result)

Driver::stream = (store, criteria, callback) ->

Driver::delete = (store, criteria, callback) ->
  params = []
  sql = "DELETE FROM #{store}" + util.expandCriteria(criteria, sanitize, params)

  @query sql, params, callback

module.exports = Driver
