Driver = require './driver-sqlite'
noop = ->

wrapCriteria = (criteria) ->
  criteria = defaultCriteria(criteria)
  if (criteria == null)
    return null

  if (criteria instanceof Array)
    if (!criteria.length)
      return null
    return criteria

  return [criteria]

defaultCriteria = (criteria) ->
  if (criteria instanceof Array)
    return criteria.map(defaultCriteria).filter (c) -> c != null

  if (!criteria?)
    return null

  # Assume non-object criteria to be value of `id` key
  if (typeof criteria == 'number' || typeof criteria == 'string')
    criteria = where: 'id', '=': criteria

  if (!criteria.where?)
    return null

  return criteria

class JSONStore
  constructor: (dbFile, customDriver) ->
    if (!dbFile?)
      throw new Error('Missing parameter: dbFile')

    @driver = customDriver || new Driver()
    @driver.init(dbFile)

JSONStore::createStore = (name, keys, callback) ->
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

  keys.id = keys.id || 'number'
  @driver.createStore(String(name), keys, callback)

JSONStore::deleteStore = (name, callback) ->
  if (!name?)
    throw new Error('Missing parameter: name')

  if (!callback?)
    callback = noop

  @driver.deleteStore(String(name), callback)

JSONStore::save = (store, object, keys, callback) ->
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

JSONStore::get = (store, criteria, callback) ->
  if (typeof store != 'string')
    throw new Error('Missing parameter: store (expected a string)')

  # If `criteria` is a function, the parameter was omitted
  if (typeof criteria == 'function')
    callback = criteria
    criteria = null

  if (!callback?)
    callback = noop

  @driver.get(store, wrapCriteria(criteria), callback)

# Same as `get`, except results are streamed back one row at
# a time instead of holding all result rows in memory
JSONStore::stream = (store, criteria, callback) ->
  if (typeof store != 'string')
    throw new Error('Missing parameter: store (expected a string)')

  # If `criteria` is a function, the parameter was omitted
  if (typeof criteria == 'function')
    callback = criteria
    criteria = null

  @driver.stream(store, wrapCriteria(criteria), callback)

JSONStore::delete = (store, criteria, callback) ->
  if (typeof store != 'string')
    throw new Error('Missing parameter: store (expected a string)')

  # If `criteria` is a function, the parameter was omitted
  if (typeof criteria == 'function')
    callback = criteria
    criteria = null

  @driver.delete(store, wrapCriteria(criteria), callback)

module.exports = JSONStore
