// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
const Settings = require('settings-sharelatex')
const mongojs = require('mongojs')
const db = mongojs(Settings.mongo.url, [
  'docHistory',
  'projectHistoryMetaData',
  'docHistoryIndex'
])
module.exports = {
  db,
  ObjectId: mongojs.ObjectId
}
