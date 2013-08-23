class Result
	constructor: ->
		@data = null
		@success = false
		@error = null

	setError: (error) ->
		@success = false
		@error = message

module.exports = Result
