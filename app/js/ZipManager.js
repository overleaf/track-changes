const logger = require('logger-sharelatex')
const UpdatesManager = require('./UpdatesManager')
const DiffGenerator = require('./DiffGenerator')
const DocumentUpdaterManager = require('./DocumentUpdaterManager')
const DocstoreManager = require('./DocstoreManager')
const PackManager = require('./PackManager')
const yazl = require('yazl')
const util = require('util')

// look in docstore or docupdater for the latest version of the document
async function getFinalContent(projectId, docId, lastUpdateVersion) {
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
  // TODO: retrieve updates incrementally
  const updates = await PackManager.promises.getOpsByVersionRange(
    projectId,
    docId,
    -1,
    null
  )
  const lastUpdateVersion = updates[0].v

  const [finalContent, version] = await getFinalContent(
    projectId,
    docId,
    lastUpdateVersion
  )

  const id = docId.toString()

  const contentEndPath = `${id}/content/end/${version}`
  zipfile.addBuffer(Buffer.from(finalContent), contentEndPath)

  const metadata = {
    id,
    version,
    content: {
      end: {
        path: contentEndPath,
        version,
      },
    },
  }

  let content = finalContent
  let v = version

  metadata.updates = updates.map(update => {
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
    }

    return {
      path: updatePath,
      version: update.v,
      ts: update.meta.start_ts,
      doc_length: content.length,
    }
  })

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
