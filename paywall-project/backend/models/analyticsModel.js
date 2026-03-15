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

export const PageView     = mongoose.model("PageView",     pageViewSchema);
export const LocationStat = mongoose.model("LocationStat", locationStatSchema);
export const SiteStat     = mongoose.model("SiteStat",     siteStatSchema);
