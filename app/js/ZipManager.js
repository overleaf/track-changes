const logger = require('logger-sharelatex')
const UpdatesManager = require('./UpdatesManager')
const DiffGenerator = require('./DiffGenerator')
const DocumentUpdaterManager = require('./DocumentUpdaterManager')
const DocstoreManager = require('./DocstoreManager')
const PackManager = require('./PackManager')
const yazl = require('yazl')
const util = require('util')

// look in docstore or docupdater for the latest version of the document
async function getLatestContent(projectId, docId, lastUpdateVersion) {
  const [docstoreContent, docstoreVersion] =
    await DocstoreManager.promises.peekDocument(projectId, docId)

  // if docstore is out of date, check for a newer version in docupdater
  // and return that instead
  if (docstoreVersion <= lastUpdateVersion) {
    const [docupdaterContent, docupdaterVersion] =
      await DocumentUpdaterManager.promises.peekDocument(projectId, docId)
    if (docupdaterVersion > docstoreVersion) {
      return [docupdaterContent, docupdaterVersion]
    }
  }

  return [docstoreContent, docstoreVersion]
}

async function rewindDoc(projectId, docId, zipfile) {
  logger.log({ projectId, docId }, 'rewinding document')

  // Prepare to rewind content

  const docIterator = await PackManager.promises.makeDocIterator(docId)

  const getUpdate = util.promisify(docIterator.next).bind(docIterator)

  const lastUpdate = await getUpdate()

  const lastUpdateVersion = lastUpdate.v

  const [latestContent, version] = await getLatestContent(
    projectId,
    docId,
    lastUpdateVersion
  )

  const id = docId.toString()

  const contentEndPath = `${id}/content/end/${version}`
  zipfile.addBuffer(Buffer.from(latestContent), contentEndPath)

  const metadata = {
    id,
    version,
    content: {
      end: {
        path: contentEndPath,
        version,
      },
    },
    updates: [],
  }

  let content = latestContent
  let v = version
  let update = lastUpdate

  while (update) {
    const updatePath = `${id}/updates/${update.v}`

    zipfile.addBuffer(Buffer.from(JSON.stringify(update)), updatePath, {
      mtime: new Date(update.meta.start_ts),
    })
    try {
      content = DiffGenerator.rewindUpdate(content, update)
      v = update.v
    } catch (e) {
      e.attempted_update = update // keep a record of the attempted update
      logger.error({ projectId, docId, err: e }, 'rewind error')
      break // stop attempting to rewind on error
    }

    metadata.updates.push({
      path: updatePath,
      version: update.v,
      ts: update.meta.start_ts,
      doc_length: content.length,
    })
    update = await getUpdate()
  }

  const contentStartPath = `${id}/content/start/${v}`
  zipfile.addBuffer(Buffer.from(content), contentStartPath)

  metadata.content.start = {
    path: contentStartPath,
    version: v,
  }

  return metadata
}

async function generateZip(projectId, zipfile) {
  await UpdatesManager.promises.processUncompressedUpdatesForProject(projectId)
  const docIds = await PackManager.promises.findAllDocsInProject(projectId)
  const manifest = { projectId, docs: [] }
  for (const docId of docIds) {
    const doc = await rewindDoc(projectId, docId, zipfile)
    manifest.docs.push(doc)
  }
  zipfile.addBuffer(
    Buffer.from(JSON.stringify(manifest, null, 2)),
    'manifest.json'
  )
  zipfile.end()
}

async function exportProject(projectId) {
  var zipfile = new yazl.ZipFile()
  generateZip(projectId, zipfile) // generate zip file in background
  return zipfile.outputStream
}

module.exports = {
  exportProject: util.callbackify(exportProject),
}
