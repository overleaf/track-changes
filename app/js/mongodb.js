const Settings = require('@overleaf/settings')
const { MongoClient, ObjectId } = require('mongodb')

const clientPromise = MongoClient.connect(
  Settings.mongo.url,
  Settings.mongo.options
)

let setupDbPromise
async function waitForDb() {
  if (!setupDbPromise) {
    setupDbPromise = setupDb()
  }
  await setupDbPromise
}

const db = {}
async function setupDb() {
  const internalDb = (await clientPromise).db()

  db.docHistory = internalDb.collection('docHistory')
  db.docHistoryIndex = internalDb.collection('docHistoryIndex')
  db.projectHistoryMetaData = internalDb.collection('projectHistoryMetaData')
}

async function closeDb() {
  let client
  try {
    client = await clientPromise
  } catch (e) {
    // there is nothing to close
    return
  }
  return client.close()
}

module.exports = {
  db,
  ObjectId,
  closeDb,
  waitForDb,
}
