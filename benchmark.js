/* eslint-disable
    camelcase,
    handle-callback-err,
*/
let i
const request = require('request')
const rclient = require('redis').createClient()
const async = require('async')
const { ObjectId } = require('./app/js/mongojs')

const NO_OF_DOCS = 100
const NO_OF_UPDATES = 200

const user_id = ObjectId().toString()

const updates = (() => {
  let asc, end
  const result = []
  for (
    i = 1, end = NO_OF_UPDATES, asc = end >= 1;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    result.push({
      op: { i: 'a', p: 0 },
      v: i,
      meta: { ts: new Date(), user_id }
    })
  }
  return result
})()
const jsonUpdates = Array.from(updates).map((u) => JSON.stringify(u))

const doc_ids = (() => {
  let asc1, end1
  const result1 = []
  for (
    i = 1, end1 = NO_OF_DOCS, asc1 = end1 >= 1;
    asc1 ? i <= end1 : i >= end1;
    asc1 ? i++ : i--
  ) {
    result1.push(ObjectId().toString())
  }
  return result1
})()

const populateRedis = function (callback) {
  if (callback == null) {
    callback = function (error) {}
  }
  console.log('Populating Redis queues...')

  const jobs = []
  for (const doc_id of Array.from(doc_ids)) {
    ;((doc_id) =>
      jobs.push((callback) =>
        rclient.rpush(
          `UncompressedHistoryOps:${doc_id}`,
          ...Array.from(jsonUpdates),
          callback
        )
      ))(doc_id)
  }
  return async.series(jobs, function (error) {
    if (error) {
      return callback(error)
    }
    console.log('Done.')
    return callback()
  })
}

const flushDocs = function (callback) {
  if (callback == null) {
    callback = function (error) {}
  }
  console.log('Flushing docs...')
  let inProgress = 0
  const jobs = []
  for (const doc_id of doc_ids) {
    ;((doc_id) =>
      jobs.push(function (callback) {
        inProgress = inProgress + 1
        return request.post(
          `http://localhost:3014/doc/${doc_id}/flush`,
          function (error) {
            inProgress = inProgress - 1
            console.log(Date.now(), `In progress: ${inProgress}`)
            return callback(error)
          }
        )
      }))(doc_id)
  }
  return async.parallel(jobs, function (error) {
    if (error) {
      return callback(error)
    }
    console.log('Done.')
    return callback()
  })
}

populateRedis(function (error) {
  if (error) {
    throw error
  }
  return flushDocs(function (error) {
    if (error) {
      throw error
    }
    return process.exit(0)
  })
})
