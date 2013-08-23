class Result
	constructor: ->
		@data = {}
		@success = false
		@error = null

	setError: (error) ->
		@success = false
		@error = message

module.exports = Result
