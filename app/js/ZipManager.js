const logger = require('logger-sharelatex')
const UpdatesManager = require('./UpdatesManager')
const DiffGenerator = require('./DiffGenerator')
const DocumentUpdaterManager = require('./DocumentUpdaterManager')
const PackManager = require('./PackManager')
const yazl = require('yazl')
const util = require('util')

async function rewindDoc(projectId, docId, zipfile) {
  logger.log({ projectId, docId }, 'rewinding document')
  const [
    finalContent,
    version
  ] = await DocumentUpdaterManager.promises.getDocument(projectId, docId)
  zipfile.addBuffer(
    Buffer.from(finalContent),
    `${docId.toString()}/content/end/${version}`
  )

  // now rewind content
  // TODO: retrieve updates incrementally
  const updates = await PackManager.promises.getOpsByVersionRange(
    projectId,
    docId,
    -1,
    version
  )

  let content = finalContent
  let v = version

  for (const update of updates) {
    zipfile.addBuffer(
      Buffer.from(JSON.stringify(update)),
      `${docId.toString()}/updates/${update.v}`,
      { mtime: new Date(update.meta.start_ts) }
    )
    try {
      content = DiffGenerator.rewindUpdate(content, update)
      v = update.v
    } catch (e) {
      e.attempted_update = update // keep a record of the attempted update
      logger.error({ projectId, docId, err: e }, 'rewind error')
    }
  }
  zipfile.addBuffer(
    Buffer.from(content),
    `${docId.toString()}/content/start/${v}`
  )
}

async function generateZip(projectId, zipfile) {
  await UpdatesManager.promises.processUncompressedUpdatesForProject(projectId)
  const docIds = await PackManager.promises.findAllDocsInProject(projectId)
  for (const docId of docIds) {
    await rewindDoc(projectId, docId, zipfile)
  }
  zipfile.end()
}

async function exportProject(projectId) {
  var zipfile = new yazl.ZipFile()
  generateZip(projectId, zipfile) // generate zip file in background
  return zipfile.outputStream
}

module.exports = {
  exportProject: util.callbackify(exportProject)
}
