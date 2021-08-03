module.exports = class DocIterator {
  constructor(packs, getPackByIdFn) {
    this.getPackByIdFn = getPackByIdFn
    // sort packs in descending order by version (i.e. most recent first)
    const byVersion = (a, b) => b.v - a.v
    this.packs = packs.slice().sort(byVersion)
    this.queue = []
  }

  next(callback) {
    const iterator = this
    const update = iterator.queue.shift()
    if (update) {
      return callback(null, update)
    }
    if (!iterator.packs.length) {
      iterator._done = true
      return callback(null)
    }
    const nextPack = iterator.packs[0]
    this.getPackByIdFn(
      nextPack.project_id,
      nextPack.doc_id,
      nextPack._id,
      function (err, pack) {
        if (err != null) {
          return callback(err)
        }
        iterator.packs.shift() // have now retrieved this pack, remove it
        for (const op of pack.pack.reverse()) {
          op.doc_id = nextPack.doc_id
          op.project_id = nextPack.project_id
          iterator.queue.push(op)
        }
        return iterator.next(callback)
      }
    )
  }

  done() {
    return this._done
  }
}
