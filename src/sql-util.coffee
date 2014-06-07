# This module provides shared functionality for SQL-based drivers

operators = ['<', '<=', '>', '>=', '=', '!=']

buildCriteria = (criteria, sanitize, params, sub) ->
  if (criteria.where?)
    criteria = { 'and': criteria }

  if (!criteria.and? && !criteria.or?)
    if (criteria.constructor != Array)
      criteria = [criteria]

    criteria = { 'and': criteria }

  mode = 'and'

  if (criteria.or?)
    mode = 'or'

  list = criteria[mode]
  if (list.constructor != Array)
    list = [list]

  result = '('
  if (sub)
    result = ' ' + mode.toUpperCase() + ' ' + result

  return result + (list.map (condition) ->
    op = condition.op = operators.filter (key) ->
      typeof condition[key] != 'undefined'

    condition.value = condition[condition.op]

    if (condition.value == null)
      op = 'IS'

      if (condition.op == '!=')
        op = 'IS NOT'

      # Unescaped NULL for SQL
      value = 'NULL'
    else
      if (typeof condition.value == 'number')
        value = condition.value
      else if (typeof condition.value == 'boolean')
        value = condition.value
      else
        value = '"' + sanitize(condition.value) + '"'

    if (params)
      params.push(condition.value)
      value = '?'

    if (condition.and?)
      value += buildCriteria({ 'and': condition.and }, sanitize, params, true)
    else if (condition.or?)
      value += buildCriteria({ 'or': condition.or }, sanitize, params, true)


    return "(`#{condition.where}` #{op} #{value})"
  ).join(' ' + mode.toUpperCase() + ' ') + ')'

# Create statements for creating an object store
createStore = (name, keys, sanitize) ->
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

  return statements

# Expand criteria into WHERE clause
expandCriteria = (criteria, sanitize, params) ->
  if (!criteria?)
    return ''

  criteria = criteria.filter (clause) -> clause.where?

  if (!criteria.length)
    return ''

  return ' WHERE ' + criteria.map((clause) ->
    buildCriteria(clause, sanitize, params)
  ).join ' AND '

# Common handling for (most) errors
handleError = (error, result, callback) ->
  if (error)
    result.error = error
    callback(result)
    return true

  return false

module.exports =
  buildCriteria: buildCriteria
  createStore: createStore
  expandCriteria: expandCriteria
  handleError: handleError
