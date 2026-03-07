import Post from "../models/postModel.js";
import { Filter } from "bad-words";
import fetch from "node-fetch";

const textFilter = new Filter();

// Detect embed type from URL
const detectEmbedType = (url) => {
  if (!url) return "";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/twitch\.tv/.test(url)) return "twitch";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/soundcloud\.com/.test(url)) return "soundcloud";
  if (/open\.spotify\.com/.test(url)) return "spotify";
  if (/music\.apple\.com/.test(url)) return "applemusic";
  if (/facebook\.com/.test(url)) return "facebook";
  if (/twitter\.com|x\.com/.test(url)) return "twitter";
  if (/tiktok\.com/.test(url)) return "tiktok";
  return "other";
};

// Check image URL with Sightengine (only if API key set)
const moderateImage = async (imageUrl) => {
  const apiUser = process.env.SIGHTENGINE_USER;
  const apiSecret = process.env.SIGHTENGINE_SECRET;
  if (!apiUser || !apiSecret) return { safe: true };

  try {
    const url = `https://api.sightengine.com/1.0/check.json?url=${encodeURIComponent(imageUrl)}&models=nudity,offensive,gore&api_user=${apiUser}&api_secret=${apiSecret}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "success") return { safe: true };

    const nudity = data.nudity?.raw > 0.6 || data.nudity?.partial > 0.7;
    const offensive = data.offensive?.prob > 0.7;
    const gore = data.gore?.prob > 0.7;

    if (nudity || offensive || gore) return { safe: false, reason: "Image contains inappropriate content" };
    return { safe: true };
  } catch {
    return { safe: true }; // fail open if API unreachable
  }
};

// ─── GET ALL POSTS (public, filterable by category) ───────────────────
export const getPosts = async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const filter = { moderationStatus: { $ne: "flagged" }, isPrivate: { $ne: true } };
    if (category) filter.category = category;

    const posts = (await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("author", "username categories")
      .lean()).filter(p => p.author);

    const total = await Post.countDocuments(filter);
    res.json({ posts, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("❌ Get Posts Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET SINGLE POST (public, but private only for author) ────────────
export const getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("author", "username categories")
      .populate("comments.author", "username");
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.moderationStatus === "flagged")
      return res.status(403).json({ message: "This post has been removed for violating community guidelines." });
    if (post.isPrivate && post.author._id.toString() !== req.user?.id)
      return res.status(403).json({ message: "This post is private." });
    res.json(post);
  } catch (err) {
    console.error("❌ Get Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CREATE POST (protected) ──────────────────────────────────────────
export const createPost = async (req, res) => {
  try {
    const { title, body, mediaUrl, imageUrl, category, agreedToTos } = req.body;

    if (!agreedToTos)
      return res.status(400).json({ message: "You must agree to the community guidelines before posting." });

    if (!title && !body && !mediaUrl && !imageUrl)
      return res.status(400).json({ message: "Post must have a title, body, media link, or image." });

    // Text moderation
    const textToCheck = `${title || ""} ${body || ""}`.trim();
    if (textToCheck && textFilter.isProfane(textToCheck))
      return res.status(400).json({ message: "Your post contains inappropriate language." });

    // Image moderation (Pictures category)
    if (imageUrl) {
      const result = await moderateImage(imageUrl);
      if (!result.safe)
        return res.status(400).json({ message: result.reason || "Image failed content moderation." });
    }

    const post = await Post.create({
      author: req.user.id,
      title: title?.trim() || "",
      body: body?.trim() || "",
      mediaUrl: mediaUrl?.trim() || "",
      imageUrl: imageUrl?.trim() || "",
      embedType: detectEmbedType(mediaUrl),
      category: category || "",
    });

    await post.populate("author", "username categories");
    res.status(201).json(post);
  } catch (err) {
    console.error("❌ Create Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET MY POSTS (protected, includes private) ───────────────────────
export const getMyPosts = async (req, res) => {
  try {
    const posts = await Post.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .populate("author", "username categories")
      .lean();
    res.json(posts);
  } catch (err) {
    console.error("❌ Get My Posts Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE POST (protected, own post only) ───────────────────────────
export const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });
    await post.deleteOne();
    res.json({ message: "Post deleted" });
  } catch (err) {
    console.error("❌ Delete Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UPDATE POST (protected, own post only) ───────────────────────────
export const updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    const { title, body, mediaUrl, imageUrl, category, isPrivate } = req.body;

    // Text moderation on edits
    const textToCheck = `${title ?? post.title} ${body ?? post.body}`.trim();
    if (textToCheck && textFilter.isProfane(textToCheck))
      return res.status(400).json({ message: "Your post contains inappropriate language." });

    // Image moderation if imageUrl changed
    if (imageUrl !== undefined && imageUrl !== post.imageUrl && imageUrl) {
      const result = await moderateImage(imageUrl);
      if (!result.safe)
        return res.status(400).json({ message: result.reason || "Image failed content moderation." });
    }

    if (title !== undefined) post.title = title.trim();
    if (body !== undefined) post.body = body.trim();
    if (mediaUrl !== undefined) {
      post.mediaUrl = mediaUrl.trim();
      post.embedType = detectEmbedType(mediaUrl);
    }
    if (imageUrl !== undefined) post.imageUrl = imageUrl.trim();
    if (category !== undefined) post.category = category;
    if (isPrivate !== undefined) post.isPrivate = isPrivate;

    await post.save();
    await post.populate("author", "username categories");
    res.json(post);
  } catch (err) {
    console.error("❌ Update Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── TOGGLE LIKE (protected) ──────────────────────────────────────────
export const toggleLike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const idx = post.likes.indexOf(req.user.id);
    if (idx === -1) post.likes.push(req.user.id);
    else post.likes.splice(idx, 1);
    await post.save();
    res.json({ likes: post.likes.length, liked: idx === -1 });
  } catch (err) {
    console.error("❌ Toggle Like Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── ADD COMMENT (protected) ──────────────────────────────────────────
export const addComment = async (req, res) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ message: "Comment cannot be empty" });

    if (textFilter.isProfane(body))
      return res.status(400).json({ message: "Your comment contains inappropriate language." });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments.push({ author: req.user.id, body: body.trim() });
    await post.save();
    await post.populate("comments.author", "username");

    res.status(201).json(post.comments[post.comments.length - 1]);
  } catch (err) {
    console.error("❌ Add Comment Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE COMMENT (protected, own comment only) ─────────────────────
export const deleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    if (comment.author.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });
    comment.deleteOne();
    await post.save();
    res.json({ message: "Comment deleted" });
  } catch (err) {
    console.error("❌ Delete Comment Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── REPORT POST (protected) ──────────────────────────────────────────
export const reportPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.reportedBy.includes(req.user.id))
      return res.status(400).json({ message: "You have already reported this post." });

    post.reportedBy.push(req.user.id);
    // Auto-flag if 5 or more reports
    if (post.reportedBy.length >= 5) post.moderationStatus = "flagged";
    await post.save();

    res.json({ message: "Post reported. Thank you for helping keep the community safe." });
  } catch (err) {
    console.error("❌ Report Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
