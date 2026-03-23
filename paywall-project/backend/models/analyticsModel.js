import mongoose from "mongoose";

// One document per unique page path — count incremented on each visit
const pageViewSchema = new mongoose.Schema({
  path:  { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
});

// One document per country — count incremented on each unique visitor IP
const locationStatSchema = new mongoose.Schema({
  country: { type: String, required: true, unique: true },
  count:   { type: Number, default: 0 },
});

// Singleton-style doc keyed by name — used for total download count
const siteStatSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
});

// Individual download log — one document per resume download
const downloadLogSchema = new mongoose.Schema({
  ip:        { type: String, default: "" },
  userAgent: { type: String, default: "" },
  country:   { type: String, default: "" },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now },
});

export const PageView     = mongoose.model("PageView",     pageViewSchema);
export const LocationStat = mongoose.model("LocationStat", locationStatSchema);
export const SiteStat     = mongoose.model("SiteStat",     siteStatSchema);
export const DownloadLog  = mongoose.model("DownloadLog",  downloadLogSchema);
