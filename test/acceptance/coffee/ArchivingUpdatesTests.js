/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS202: Simplify dynamic range loops
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const sinon = require("sinon");
const chai = require("chai");
chai.should();
const { expect } = chai;
const mongojs = require("../../../app/js/mongojs");
const { db } = mongojs;
const { ObjectId } = mongojs;
const Settings = require("settings-sharelatex");
const request = require("request");
const rclient = require("redis").createClient(Settings.redis.history); // Only works locally for now

const TrackChangesApp = require("./helpers/TrackChangesApp");
const TrackChangesClient = require("./helpers/TrackChangesClient");
const MockDocStoreApi = require("./helpers/MockDocStoreApi");
const MockWebApi = require("./helpers/MockWebApi");

describe("Archiving updates", function() {
	before(function(done) {
		if (__guard__(__guard__(Settings != null ? Settings.trackchanges : undefined, x1 => x1.s3), x => x.key.length) < 1) {
			const message = new Error("s3 keys not setup, this test setup will fail");
			return done(message);
		}

		return TrackChangesClient.waitForS3(done);
	});

	before(function(done) {
		this.now = Date.now();
		this.to = this.now;
		this.user_id = ObjectId().toString();
		this.doc_id = ObjectId().toString();
		this.project_id = ObjectId().toString();

		this.minutes = 60 * 1000;
		this.hours = 60 * this.minutes;

		MockWebApi.projects[this.project_id] = {
			features: {
				versioning: true
			}
		};
		sinon.spy(MockWebApi, "getProjectDetails");

		MockWebApi.users[this.user_id] = (this.user = {
			email: "user@sharelatex.com",
			first_name: "Leo",
			last_name: "Lion",
			id: this.user_id
		});
		sinon.spy(MockWebApi, "getUserInfo");

		MockDocStoreApi.docs[this.doc_id] = (this.doc = { 
			_id: this.doc_id,
			project_id: this.project_id
		});
		sinon.spy(MockDocStoreApi, "getAllDoc");

		this.updates = [];
		for (let i = 0, end = 512+10, asc = 0 <= end; asc ? i <= end : i >= end; asc ? i++ : i--) {
			this.updates.push({
				op: [{ i: "a", p: 0 }],
				meta: { ts: this.now + ((i-2048) * this.hours), user_id: this.user_id },
				v: (2 * i) + 1
			});
			this.updates.push({
				op: [{ i: "b", p: 0 }],
				meta: { ts: this.now + ((i-2048) * this.hours) + (10*this.minutes), user_id: this.user_id },
				v: (2 * i) + 2
			});
		}
		TrackChangesApp.ensureRunning(() => {
			return TrackChangesClient.pushRawUpdates(this.project_id, this.doc_id, this.updates, error => {
				if (error != null) { throw error; }
				return TrackChangesClient.flushDoc(this.project_id, this.doc_id, function(error) {
					if (error != null) { throw error; }
					return done();
				});
			});
		});
		return null;
	});

	after(function(done) {
		MockWebApi.getUserInfo.restore();
		return db.docHistory.remove({project_id: ObjectId(this.project_id)}, () => {
			return db.docHistoryIndex.remove({project_id: ObjectId(this.project_id)}, () => {
				return TrackChangesClient.removeS3Doc(this.project_id, this.doc_id, done);
			});
		});
	});

	describe("archiving a doc's updates", function() {
		before(function(done) {
			TrackChangesClient.pushDocHistory(this.project_id, this.doc_id, function(error) {
				if (error != null) { throw error; }
				return done();
			});
			return null;
		});

		it("should have one cached pack", function(done) {
			return db.docHistory.count({ doc_id: ObjectId(this.doc_id), expiresAt:{$exists:true}}, function(error, count) {
				if (error != null) { throw error; }
				count.should.equal(1);
				return done();
			});
		});

		it("should have one remaining pack after cache is expired", function(done) {
			return db.docHistory.remove({
				doc_id: ObjectId(this.doc_id),
				expiresAt:{$exists:true}
			}, (err, result) => {
				if (typeof error !== 'undefined' && error !== null) { throw error; }
				return db.docHistory.count({ doc_id: ObjectId(this.doc_id)}, function(error, count) {
					if (error != null) { throw error; }
					count.should.equal(1);
					return done();
				});
			});
		});

		it("should have a docHistoryIndex entry marked as inS3", function(done) {
			return db.docHistoryIndex.findOne({ _id: ObjectId(this.doc_id) }, function(error, index) {
				if (error != null) { throw error; }
				index.packs[0].inS3.should.equal(true);
				return done();
			});
		});

		it("should have a docHistoryIndex entry with the last version", function(done) {
			return db.docHistoryIndex.findOne({ _id: ObjectId(this.doc_id) }, function(error, index) {
				if (error != null) { throw error; }
				index.packs[0].v_end.should.equal(1024);
				return done();
			});
		});

		return it("should store 1024 doc changes in S3 in one pack", function(done) {
			return db.docHistoryIndex.findOne({ _id: ObjectId(this.doc_id) }, (error, index) => {
				if (error != null) { throw error; }
				const pack_id = index.packs[0]._id;
				return TrackChangesClient.getS3Doc(this.project_id, this.doc_id, pack_id, (error, doc) => {
					doc.n.should.equal(1024);
					doc.pack.length.should.equal(1024);
					return done();
				});
			});
		});
	});

	return describe("unarchiving a doc's updates", function() {
		before(function(done) {
			TrackChangesClient.pullDocHistory(this.project_id, this.doc_id, function(error) {
				if (error != null) { throw error; }
				return done();
			});
			return null;
		});

		return it("should restore both packs", function(done) {
			return db.docHistory.count({ doc_id: ObjectId(this.doc_id) }, function(error, count) {
				if (error != null) { throw error; }
				count.should.equal(2);
				return done();
			});
		});
	});
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}