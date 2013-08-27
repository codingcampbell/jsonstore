opMap =
	gt: '>'
	lt: '<'
	eq: '='
	ne: '!='

buildCriteria = (criteria, sanitize, sub) ->
	if (!criteria.and? && !criteria.or?)
		if (criteria.constructor != Array)
			criteria = [criteria]

		criteria = { 'and': criteria }

	console.log(criteria)

	mode = 'and'

	if (criteria.or?)
		mode = 'or'

	list = criteria[mode]

	result = ' ('
	if (sub)
		result = ' ' + mode.toUpperCase() + result

	return result + (list.map (condition) ->
		op = opMap[condition.op] ? '='

		if (condition.value == null)
			op = 'IS'

			if (condition.op == 'ne')
				op = 'IS NOT'

			# Unescaped NULL for SQL
			value = 'NULL'
		else
			value = '"' + sanitize(condition.value) + '"'

		if (condition.and?)
			value += buildCriteria(condition.and, sanitize, true)
		else if (condition.or?)
			value += buildCriteria(condition.or, sanitize, true)

		return "(`#{condition.key}` #{op} #{value})"
	).join(' ' + mode.toUpperCase() + ' ') + ')'

module.exports =
	buildCriteria: buildCriteria
