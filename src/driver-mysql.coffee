async = require 'async'
Result = require './result'
util = require './sql-util'
noop = ->

# Escape quotes for SQLite-compatible strings
sanitize = (str) -> String(str).replace(/'/g, "\\'")

class Driver
  init: ->

# General query that wraps rows in a Result object
Driver::query = (query, params, callback) ->

# Execute non-query statements
Driver::exec = (statement, params, callback) ->

# Get an individual store's metadata
Driver::getMetaData = (store, callback) ->

Driver::createStore = (name, keys, callback) ->

Driver::deleteStore = (name, callback) ->

Driver::save = (store, object, keys, callback) ->

Driver::getQuery = (store, criteria, params) ->

Driver::get = (store, criteria, callback) ->

Driver::stream = (store, criteria, callback) ->

Driver::delete = (store, criteria, callback) ->

module.exports = Driver
