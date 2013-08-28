operators = ['<', '<=', '>', '>=', '=', '!=']

buildCriteria = (criteria, sanitize, sub) ->
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

		if (condition.and?)
			value += buildCriteria({ 'and': condition.and }, sanitize, true)
		else if (condition.or?)
			value += buildCriteria({ 'or': condition.or }, sanitize, true)

		return "(`#{condition.where}` #{op} #{value})"
	).join(' ' + mode.toUpperCase() + ' ') + ')'

module.exports =
	buildCriteria: buildCriteria
