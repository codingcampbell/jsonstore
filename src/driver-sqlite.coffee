async = require 'async'
sqlite3 = require 'sqlite3'
Result = require './result'
util = require './sql-util'
noop = ->

# Escape quotes for SQLite-compatible strings
sanitize = (str) -> String(str).replace(/'/g, "''")

# Common handling for (most) errors
handleError = (error, result, callback) ->
  if (error)
    result.error = error
    callback(result)
    return true

  return false

# Expand criteria into WHERE clause
expandCriteria = (criteria, params) ->
  if (!criteria?)
    return ''

  criteria = criteria.filter (clause) -> clause.where?

  if (criteria.length)
    return ' WHERE ' + criteria.map((clause) ->
      util.buildCriteria(clause, sanitize, params)
    ).join ' AND '

  return ''

# Run multiple non-prepared statements
multiExec = (db, statements, callback) ->
  result = new Result()

  if (!(statements instanceof Array))
    statements = [statements]

  if (!callback?)
    callback = noop

  db.serialize ->
    db.exec statements.join('; '), (error) ->
      if (handleError(error, result, callback))
        return callback = noop

      result.success = true
      callback(result)

class Driver
  init: (dbFile) ->
    @db = new sqlite3.Database(dbFile)

# General query that wraps rows in a Result object
Driver::query = (query, params, callback) ->
  result = new Result()

  if (typeof params == 'function')
    callback = params
    params = []

  @db.serialize => @db.all query, params, (err, data) ->
    if (!handleError(err, result, callback))
      result.success = true
      result.data = data

      callback(result)

# Execute non-query statements
Driver::exec = (statement, params, callback) ->
  result = new Result()

  if (typeof params == 'function')
    callback = params
    params = []

  @db.serialize => @db.run statement, params, (err, data) ->
    if (!handleError(err, result, callback))
      result.success = true
      result.data = this

      callback(result)

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
  statements = []
  sql = "CREATE TABLE `#{name}`"
  columns = []
  meta = { keys: Object.keys(keys) }
  keys['__jsondata'] = 'string'

  Object.keys(keys).forEach (key) ->
    column = "`#{key}` "

    if (keys[key] == 'number')
      column += 'INTEGER'
    else
      column += 'TEXT'

    if (key == 'id')
      column += ' PRIMARY KEY NOT NULL'

    columns.push(column)

    # Index user-specified keys only
    if (!/^__/.test(key))
      type = (key == 'id' && 'UNIQUE' || '') + ' INDEX'

      statements.push """
        CREATE #{type} `idx-#{name}-#{key}` ON `#{name}`(`#{key}`)
      """

  # Meta table is used to track keys (instead of querying the schema)
  statements.push """
    CREATE TABLE IF NOT EXISTS __meta(
      `id` INTEGER PRIMARY KEY,
      `store` VARCHAR(255) NOT NULL,
      `data` TEXT NOT NULL
    );
  """

  statements.push """
    INSERT INTO __meta (`store`, `data`)
    VALUES('#{sanitize name}', '#{sanitize JSON.stringify meta}');
  """

  # Finish CREATE TABLE for this store
  sql += '(' + columns.join(', ') + ')'
  statements.unshift(sql)

  # Wrap into transaction
  statements.unshift('BEGIN')
  statements.push('COMMIT')

  multiExec(@db, statements, callback)

Driver::deleteStore = (name, callback) ->
  statements = [
    'BEGIN'
    "DELETE FROM __meta WHERE `store` = '#{sanitize name}'"
    "DROP TABLE #{sanitize name}"
    'COMMIT'
  ]

  multiExec(@db, statements, callback)

Driver::save = (store, object, keys, callback) -> async.waterfall [
  # Begin transaction
  (callback) => @exec 'BEGIN', -> callback(null)

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
        keyData[":#{key}"] = object[key]

    # Allow keys param to override assumed key values
    Object.keys(keys).forEach (key) ->
      if (meta.keys.indexOf(key) != -1)
        keyData[":#{key}"] = keys[key]

    # Make sure an overidden ID key makes it into the object
    if (typeof keys.id != 'undefined')
      object.id = keys.id

    # Get keynames without bind prefix
    keyNames = Object.keys(keyData).map (key) -> key.slice(1)

    # Add the serialized JSON object to the row
    keyNames.push('__jsondata')
    keyData[':__jsondata'] = JSON.stringify(object)

    # Build insert query
    sql = """
      INSERT OR REPLACE INTO `#{store}` (
        #{keyNames.map((key) -> "`#{key}`").join ', '}
      ) VALUES (
        #{keyNames.map((key) -> ":#{key}").join ', '}
      );"
    """

    # Execute insert statement
    @exec sql, keyData, (result) =>
      if (!result.success)
        return callback(result)

      # If object does not have an ID key, we take
      # the ID generated by SQLite, modify the object to include it,
      # and re-save the modified object.
      if (typeof keyData[':id'] == 'undefined')
        if (typeof result.data.lastID != 'undefined')
          object.id = result.data.lastID
          return @save(store, object, keys, callback)

        result.setError('No ID key found in object or from SQLite')
        return callback(result)

      result.data = object
      callback(null, result)

  # Process result and notify callbacks of errors
  (result, callback) ->
    if (!result.success)
      return callback(result)

    callback(null, result)

  # End transaction
  (result, callback) => @exec 'COMMIT', -> callback(null, result)

], (err, result) -> callback(err || result)

Driver::getQuery = (store, criteria, params) ->
  sql = "SELECT __jsondata FROM #{store}" + expandCriteria(criteria, params)

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
  result = new Result()
  currentRow = null

  @db.serialize => @db.each(
    @getQuery(store, criteria)

    # Callback for every low except the last one
    (err, row) ->
      if (err)
        result.setError(err)
        return callback(result)

      if (!row['__jsondata'])
        result.setError('No JSON data returned')
        return callback(result)

      if (currentRow)
        result.success = true
        result.data = currentRow
        callback(result)

      try
        currentRow = JSON.parse(row['__jsondata'])
      catch err
        result.setError(err)
        return callback(result)

    # Callback for the last row only
    (err, numRows) ->
      if (err)
        result.setError(err)
        return callback(result, true)

      result.success = true
      result.data = currentRow
      callback(result, true, numRows)
  )

Driver::delete = (store, criteria, callback) ->
  params = []
  sql = "DELETE FROM #{store}" + expandCriteria(criteria, params)

  @exec sql, params, callback

module.exports = Driver
