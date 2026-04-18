/**
 * postController.js
 *
 * Handles all post-related HTTP request logic:
 *  - Public feed (filterable by category, paginated, excludes private accounts)
 *  - Single post retrieval (respects private/flagged status)
 *  - Creating, updating, and deleting posts (auth-protected, owner-only)
 *  - Toggling likes (auth-protected)
 *  - Adding and deleting comments (auth-protected, owner-only)
 *  - Reporting posts and comments
 *  - Getting the like list for a post
 *
 * Content moderation is applied at create/edit time via:
 *  1. The `bad-words` package for text (titles, bodies, comments)
 *  2. The Sightengine API for images (nudity, offensive content, gore)
 *
 * Real-time notifications (comment, mention) are emitted after the HTTP
 * response via fire-and-forget IIFEs so they never block the response.
 */

import Post from "../models/postModel.js";
import { Filter } from "bad-words";
import fetch from "node-fetch";
import { siteLog } from "../utils/siteLog.js";

// Single shared profanity filter instance
const textFilter = new Filter();

// Escape special regex characters in user input to prevent ReDoS
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Infers the embed type for a given media URL.
 * Used to tell the frontend which embed component to render.
 *
 * @param   {string} url - The raw media URL
 * @returns {string}       One of: "youtube" | "twitch" | "instagram" | "soundcloud"
 *                         | "spotify" | "applemusic" | "facebook" | "twitter"
 *                         | "tiktok" | "other" | "" (empty string if no URL)
 */
const detectEmbedType = (url) => {
  if (!url) return "";

  // YouTube channel/profile URLs (before generic youtube match)
  // Allow trailing slash, /videos, /featured, /shorts, /streams, /community, /about, /playlists, /channels etc.
  if (/youtube\.com\/@[^/?]+(\/(videos|featured|shorts|streams|community|about|playlists|channels)?)?\s*$/i.test(url) ||
      /youtube\.com\/channel\/[^/?]+(\/(videos|featured|shorts|streams|community|about|playlists|channels)?)?\s*$/i.test(url))
    return "yt-channel";

  // Twitch channel URLs (not clips or videos)
  if (/twitch\.tv\/[^/?]+\s*$/i.test(url) && !/\/clip\/|\/videos?\//.test(url))
    return "twitch-channel";

  // Kick channel URLs
  if (/kick\.com\/[^/?]+\s*$/i.test(url) && !/\/video\/|\/clip\//.test(url))
    return "kick-channel";

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

/**
 * Sends an image URL to the Sightengine moderation API and checks for
 * nudity, offensive content, and gore.
 *
 * Fails open (returns { safe: true }) in two cases:
 *  - The SIGHTENGINE_USER / SIGHTENGINE_SECRET env vars are not set (dev mode)
 *  - The API call throws or returns a non-success status
 *
 * Probability thresholds:
 *  - nudity.raw   > 0.6  → unsafe
 *  - nudity.partial > 0.7 → unsafe
 *  - offensive.prob > 0.7 → unsafe
 *  - gore.prob    > 0.7  → unsafe
 *
 * @param   {string} imageUrl - The publicly accessible image URL to check
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
const moderateImage = async (imageUrl) => {
  const apiUser = process.env.SIGHTENGINE_USER;
  const apiSecret = process.env.SIGHTENGINE_SECRET;

  // Skip moderation if credentials are not configured (e.g. local dev)
  if (!apiUser || !apiSecret) return { safe: true };

  try {
    const url = `https://api.sightengine.com/1.0/check.json?url=${encodeURIComponent(imageUrl)}&models=nudity,offensive,gore&api_user=${apiUser}&api_secret=${apiSecret}`;
    const res = await fetch(url);
    const data = await res.json();

    // Treat unexpected API responses as safe to avoid false positives
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

// ─── GET ALL POSTS ────────────────────────────────────────────────────────────

/**
 * GET /api/posts  (public)
 *
 * Returns a paginated list of public, non-flagged posts.
 * Posts from private accounts and posts marked isPrivate are excluded.
 *
 * Query params:
 *  @param {string} [category] - Filter by category string
 *  @param {number} [page=1]   - Page number (1-indexed)
 *  @param {number} [limit=20] - Results per page
 *
 * Responds with: { posts, total, page, pages }
 * Each post includes populated author { username, categories }.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getPosts = async (req, res) => {
  try {
    const { category, page = 1, limit = 20, q, sort, author: authorUsername } = req.query;

    // Base filter: exclude flagged posts and explicitly private posts
    const filter = { moderationStatus: { $ne: "flagged" }, isPrivate: { $ne: true } };
    if (category) filter.category = category;

    // Dynamically import User to avoid circular dependency issues
    const User = (await import("../models/userModel.js")).default;

    // Filter by specific author username (used by CreatorProfile)
    if (authorUsername) {
      const authorDoc = await User.findOne({ username: authorUsername }).select("_id").lean();
      if (!authorDoc) return res.json({ posts: [], total: 0, page: 1, pages: 0 });
      filter.author = authorDoc._id;
    } else {
      // Exclude posts whose authors have set their account to private
      const privateUsers = await User.find({ isPrivateAccount: true }).select("_id").lean();
      if (privateUsers.length > 0) {
        filter.author = { $nin: privateUsers.map(u => u._id) };
      }
    }

    // Full-text search: match title, body, category (regex), or author username
    if (q && q.trim()) {
      const escaped = escapeRegex(q.trim());
      const matchingAuthors = await User.find({ username: { $regex: escaped, $options: "i" } })
        .select("_id").lean();
      const orClauses = [
        { title:    { $regex: escaped, $options: "i" } },
        { body:     { $regex: escaped, $options: "i" } },
        { category: { $regex: escaped, $options: "i" } },
      ];
      if (matchingAuthors.length) orClauses.push({ author: { $in: matchingAuthors.map(u => u._id) } });
      filter.$or = orClauses;
    }

    const lim = parseInt(limit);
    const pg  = parseInt(page);
    const total = await Post.countDocuments(filter);

    let posts;
    if (sort === "popular") {
      // Aggregate to sort by likes count descending
      posts = await Post.aggregate([
        { $match: filter },
        { $addFields: { likesCount: { $size: "$likes" } } },
        { $sort: { likesCount: -1, createdAt: -1 } },
        { $skip: (pg - 1) * lim },
        { $limit: lim },
        { $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "author",
            pipeline: [{ $project: { username: 1, categories: 1 } }],
        }},
        { $unwind: { path: "$author", preserveNullAndEmptyArrays: false } },
      ]);
    } else {
      posts = (await Post.find(filter)
        .sort({ createdAt: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .populate("author", "username categories")
        .lean())
        .filter(p => p.author);           // drop posts whose author document was deleted
    }

    res.json({ posts, total, page: pg, pages: Math.ceil(total / lim) });
  } catch (err) {
    console.error("❌ Get Posts Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET SINGLE POST ──────────────────────────────────────────────────────────

/**
 * GET /api/posts/:id  (public, with auth for private posts)
 *
 * Returns a single post by its MongoDB ID.
 * Enforces:
 *  - 403 for flagged posts (content removed)
 *  - 403 for private posts unless the requester is the author
 *    (req.user is optionally set by the auth middleware on this route)
 *
 * Responds with the full post document including populated author and
 * comment authors.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("author", "username categories isPrivateAccount isAdmin")
      .populate("comments.author", "username");
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Flagged posts are hidden from all users (admin removes via separate flow)
    if (post.moderationStatus === "flagged")
      return res.status(403).json({ message: "This post has been removed for violating community guidelines." });

    const isOwner = post.author?._id?.toString() === req.user?.id;
    const isAdmin = req.user?.isAdmin;

    // Private posts (paywalled) are only visible to their author
    if (post.isPrivate && !isOwner)
      return res.status(403).json({ message: "This post is private." });

    // Posts from private accounts are only visible to the account owner or admins
    if (post.author?.isPrivateAccount && !isOwner && !isAdmin)
      return res.status(403).json({ message: "This account is private." });

    res.json(post);
  } catch (err) {
    console.error("❌ Get Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CREATE POST ──────────────────────────────────────────────────────────────

/**
 * POST /api/posts  (protected)
 *
 * Creates a new post for the authenticated user.
 * Content moderation is applied before creation:
 *  - Profanity filter on title + body text
 *  - Image moderation via Sightengine if an imageUrl is provided
 *
 * After responding, fires an IIFE in the background to emit "mention"
 * notifications to any @username values found in the title/body,
 * but only for users who are mutual followers with the author.
 *
 * Body params:
 *  @param {string}  title       - Post title
 *  @param {string}  body        - Post body text
 *  @param {string}  [mediaUrl]  - Embed URL (YouTube, Twitch, etc.)
 *  @param {string}  [imageUrl]  - Direct image URL (passed through Sightengine)
 *  @param {string}  [category]  - Content category tag
 *  @param {boolean} agreedToTos - Must be true; users confirm community guidelines
 *
 * Responds 201 with the populated post document.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const createPost = async (req, res) => {
  try {
    const { title, body, mediaUrl, imageUrl, category, agreedToTos } = req.body;

    // Users must explicitly agree to community guidelines each time they post
    if (!agreedToTos)
      return res.status(400).json({ message: "You must agree to the community guidelines before posting." });

    // At least one content field must be non-empty
    if (!title && !body && !mediaUrl && !imageUrl)
      return res.status(400).json({ message: "Post must have a title, body, media link, or image." });

    // ── Text moderation ──────────────────────────────────────────────────────
    const textToCheck = `${title || ""} ${body || ""}`.trim();
    if (textToCheck && textFilter.isProfane(textToCheck))
      return res.status(400).json({ message: "Your post contains inappropriate language." });

    // ── Image moderation ─────────────────────────────────────────────────────
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
      embedType: detectEmbedType(mediaUrl), // derive embed type from the URL
      category: category || "",
    });

    await post.populate("author", "username categories");
    res.status(201).json(post);

    siteLog({ userId: req.user._id, username: req.user.username, action: "Post Created", targetUsername: req.user.username, detail: post.title || "", sourceType: "post", sourceId: post._id, sourceUrl: `/post/${post._id}` });

    // ── Fire-and-forget @mention notifications ───────────────────────────────
    // Run asynchronously after the response so latency is not visible to user
    (async () => {
      try {
        // Extract all @username tokens from the post text
        const mentionRegex = /@([a-zA-Z0-9_]+)/g;
        const mentionedUsernames = new Set();
        let match;
        const searchText = `${title || ""} ${body || ""}`;
        while ((match = mentionRegex.exec(searchText)) !== null) mentionedUsernames.add(match[1]);
        if (mentionedUsernames.size === 0) return;

        const { getIo } = await import("../utils/socketEmitter.js");
        const Notification = (await import("../models/notificationModel.js")).default;
        const User = (await import("../models/userModel.js")).default;
        const io = getIo();

        // Load the author's relationship data to enforce the mutual-follow rule
        const mentionerDoc = await User.findById(req.user.id).select("following followers").lean();
        const followingSet = new Set(mentionerDoc.following.map(id => id.toString()));
        const followersSet = new Set(mentionerDoc.followers.map(id => id.toString()));

        const mentionedUsers = await User.find({ username: { $in: [...mentionedUsernames] } }).select("_id username").lean();
        for (const mentioned of mentionedUsers) {
          const mid = mentioned._id.toString();
          if (mid === req.user.id) continue; // don't notify yourself
          // Only send mention notifications to mutual followers
          if (!followingSet.has(mid) || !followersSet.has(mid)) continue;

          const notif = await Notification.create({ recipient: mentioned._id, type: "mention", sender: req.user.id, post: post._id });
          io?.to(mid).emit("notification", {
            _id: notif._id, type: "mention",
            sender: { _id: req.user.id, username: req.user.username },
            post: { _id: post._id, title: post.title },
            read: false, createdAt: notif.createdAt,
          });
        }
      } catch (e) {
        console.warn("Create post mention notification failed:", e.message);
      }
    })().catch((e) => console.warn("Create post mention IIFE error:", e.message));
  } catch (err) {
    console.error("❌ Create Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET MY POSTS ─────────────────────────────────────────────────────────────

/**
 * GET /api/posts/my  (protected)
 *
 * Returns all posts authored by the authenticated user, including private
 * ones (unlike the public feed which excludes them).
 *
 * Responds with an array of post documents sorted newest-first.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
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

// ─── DELETE POST ──────────────────────────────────────────────────────────────

/**
 * DELETE /api/posts/:id  (protected, owner only)
 *
 * Permanently deletes the specified post. Only the post's author may delete it
 * (admins have a separate deletion route in adminController).
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Verify the requester is the post owner
    if (post.author.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    const logDetail = post.title || (post.body || '').slice(0, 80);
    await post.deleteOne();
    res.json({ message: "Post deleted" });
    siteLog({ userId: req.user._id, username: req.user.username, action: "Post Deleted (owner)", detail: logDetail, sourceType: "post" });
  } catch (err) {
    console.error("❌ Delete Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── UPDATE POST ──────────────────────────────────────────────────────────────

/**
 * PUT /api/posts/:id  (protected, owner only)
 *
 * Partially updates the specified post. Only the post's author may edit it.
 * Applies the same content moderation as createPost (text and image checks).
 *
 * Image moderation is only re-run if the imageUrl actually changed to avoid
 * unnecessary API calls when only text or metadata is updated.
 *
 * Updating mediaUrl automatically re-derives embedType.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Body params (all optional — only provided fields are updated):
 *  @param {string}  [title]
 *  @param {string}  [body]
 *  @param {string}  [mediaUrl]
 *  @param {string}  [imageUrl]
 *  @param {string}  [category]
 *  @param {boolean} [isPrivate]
 *
 * Responds with the updated, populated post document.
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Only the post's author can edit it
    if (post.author.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    const { title, body, mediaUrl, imageUrl, category, isPrivate } = req.body;

    // ── Text moderation on edits ─────────────────────────────────────────────
    // Combine incoming values with existing ones (use existing if not being changed)
    const textToCheck = `${title ?? post.title} ${body ?? post.body}`.trim();
    if (textToCheck && textFilter.isProfane(textToCheck))
      return res.status(400).json({ message: "Your post contains inappropriate language." });

    // ── Image moderation — only when imageUrl is actually changing ───────────
    if (imageUrl !== undefined && imageUrl !== post.imageUrl && imageUrl) {
      const result = await moderateImage(imageUrl);
      if (!result.safe)
        return res.status(400).json({ message: result.reason || "Image failed content moderation." });
    }

    // Snapshot old content before mutating — stored in the log so admins can see what changed
    const oldTitle = post.title;
    const oldBody  = post.body;

    // Apply partial updates
    if (title !== undefined) post.title = title.trim();
    if (body !== undefined) post.body = body.trim();
    if (mediaUrl !== undefined) {
      post.mediaUrl = mediaUrl.trim();
      post.embedType = detectEmbedType(mediaUrl); // re-derive embed type from new URL
    }
    if (imageUrl !== undefined) post.imageUrl = imageUrl.trim();
    if (category !== undefined) post.category = category;
    if (isPrivate !== undefined) post.isPrivate = isPrivate;

    const prevSnapshot = `was: "${oldTitle || '(no title)'}" — ${(oldBody || '').slice(0, 80)}${oldBody?.length > 80 ? '…' : ''}`;
    await post.save();
    await post.populate("author", "username categories");
    res.json(post);
    siteLog({ userId: req.user._id, username: req.user.username, action: "Post Edited", detail: prevSnapshot, sourceType: "post", sourceId: post._id, sourceUrl: `/post/${post._id}` });
  } catch (err) {
    console.error("❌ Update Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── TOGGLE LIKE ──────────────────────────────────────────────────────────────

/**
 * PUT /api/posts/:id/like  (protected)
 *
 * Toggles a like on the specified post for the authenticated user.
 * Uses $addToSet / $pull atomically so concurrent requests are safe.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Responds with: { likes: number, liked: boolean }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const toggleLike = async (req, res) => {
  try {
    // Check if the user has already liked this post (returns truthy if found)
    const already = await Post.exists({ _id: req.params.id, likes: req.user.id });

    // Build the atomic update: remove if already liked, add if not
    const update = already
      ? { $pull: { likes: req.user.id } }
      : { $addToSet: { likes: req.user.id } };

    const post = await Post.findByIdAndUpdate(req.params.id, update, { new: true }).select("likes");
    if (!post) return res.status(404).json({ message: "Post not found" });

    res.json({ likes: post.likes.length, liked: !already });
    siteLog({ userId: req.user._id, username: req.user.username, action: already ? "Unliked Post" : "Liked Post", sourceType: "post", sourceId: post._id, sourceUrl: `/post/${req.params.id}` });
  } catch (err) {
    console.error("❌ Toggle Like Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── ADD COMMENT ──────────────────────────────────────────────────────────────

/**
 * POST /api/posts/:id/comments  (protected)
 *
 * Adds a comment to the specified post, after passing it through the
 * profanity filter.
 *
 * After responding, fires a background IIFE that:
 *  1. Emits a "comment" notification to the post author (unless they are
 *     the commenter themselves)
 *  2. Emits "mention" notifications to any @username tokens in the comment
 *     body, but only for mutual followers, and only if they haven't already
 *     received a comment notification for this post
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Body params:
 *  @param {string} body - Comment text (required, non-empty)
 *
 * Responds 201 with the new comment document (author populated).
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const addComment = async (req, res) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ message: "Comment cannot be empty" });

    // Check comment text for profanity
    if (textFilter.isProfane(body))
      return res.status(400).json({ message: "Your comment contains inappropriate language." });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments.push({ author: req.user.id, body: body.trim() });
    await post.save();
    await post.populate("comments.author", "username");

    // Grab the comment we just added (always the last element)
    const newComment = post.comments[post.comments.length - 1];
    res.status(201).json(newComment);

    siteLog({ userId: req.user._id, username: req.user.username, action: "Comment Added", detail: body.trim().slice(0, 80), sourceType: "post", sourceId: post._id, sourceUrl: `/post/${post._id}` });

    // ── Fire-and-forget comment + mention notifications ──────────────────────
    (async () => {
      try {
        const { getIo } = await import("../utils/socketEmitter.js");
        const Notification = (await import("../models/notificationModel.js")).default;
        const User = (await import("../models/userModel.js")).default;
        const io = getIo();

        // Notify the post author about the new comment (but not if they wrote it)
        if (post.author.toString() !== req.user.id) {
          const notif = await Notification.create({ recipient: post.author, type: "comment", sender: req.user.id, post: post._id });
          io?.to(post.author.toString()).emit("notification", {
            _id: notif._id, type: "comment",
            sender: { _id: req.user.id, username: req.user.username },
            post: { _id: post._id, title: post.title },
            read: false, createdAt: notif.createdAt,
          });
        }

        // ── Parse @mentions from comment body ────────────────────────────────
        const mentionRegex = /@([a-zA-Z0-9_]+)/g;
        const mentionedUsernames = new Set();
        let match;
        while ((match = mentionRegex.exec(body)) !== null) mentionedUsernames.add(match[1]);

        if (mentionedUsernames.size > 0) {
          // Load the commenter's relationship data to enforce the mutual-follow rule
          const mentionerDoc = await User.findById(req.user.id).select("following followers").lean();
          const followingSet = new Set(mentionerDoc.following.map(id => id.toString()));
          const followersSet = new Set(mentionerDoc.followers.map(id => id.toString()));

          const mentionedUsers = await User.find({ username: { $in: [...mentionedUsernames] } }).select("_id username").lean();
          for (const mentioned of mentionedUsers) {
            const mid = mentioned._id.toString();
            if (mid === req.user.id) continue; // don't notify yourself
            if (mid === post.author.toString()) continue; // already got a "comment" notification
            // Only notify mutual followers
            if (!followingSet.has(mid) || !followersSet.has(mid)) continue;

            const notif = await Notification.create({ recipient: mentioned._id, type: "mention", sender: req.user.id, post: post._id });
            io?.to(mid).emit("notification", {
              _id: notif._id, type: "mention",
              sender: { _id: req.user.id, username: req.user.username },
              post: { _id: post._id, title: post.title },
              read: false, createdAt: notif.createdAt,
            });
          }
        }
      } catch (e) {
        console.warn("Notification emit failed:", e.message);
      }
    })().catch((e) => console.warn("Comment notification IIFE error:", e.message));
  } catch (err) {
    console.error("❌ Add Comment Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── DELETE COMMENT ───────────────────────────────────────────────────────────

/**
 * DELETE /api/posts/:id/comments/:commentId  (protected, owner only)
 *
 * Removes a specific comment from a post. Only the comment's author may
 * delete it (admins use a separate route in adminController).
 *
 * Route params:
 *  @param {string} id        - MongoDB ObjectId of the parent post
 *  @param {string} commentId - MongoDB ObjectId of the comment (subdocument)
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const deleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Use Mongoose's subdocument .id() helper to find the embedded comment
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Only the comment's author can delete it
    if (comment.author.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    const deletedBody = comment.body;
    comment.deleteOne();
    await post.save();
    res.json({ message: "Comment deleted" });
    siteLog({ userId: req.user._id, username: req.user.username, action: "Comment Deleted", detail: deletedBody.slice(0, 80), sourceType: "post", sourceId: post._id, sourceUrl: `/post/${post._id}` });
  } catch (err) {
    console.error("❌ Delete Comment Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET LIKES ────────────────────────────────────────────────────────────────

/**
 * GET /api/posts/:id/likes  (public)
 *
 * Returns the full list of users who have liked the specified post,
 * with each user's username included.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Responds with: { likes: [{ _id, username }] }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const getLikes = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate("likes", "username");
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json({ likes: post.likes });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── REPORT POST ──────────────────────────────────────────────────────────────

/**
 * POST /api/posts/:id/report  (protected)
 *
 * Submits a user report against the specified post.
 * Each user can only report a post once (idempotency check via reportedBy array).
 * If a post accumulates 5 or more reports it is automatically flagged and
 * hidden from the public feed pending admin review.
 *
 * Route params:
 *  @param {string} id - MongoDB ObjectId of the post
 *
 * Body params:
 *  @param {string} reason - Required description of the violation
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const reportPost = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ message: "A reason is required to report a post." });

    const post = await Post.findById(req.params.id).populate("author", "username");
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Prevent duplicate reports from the same user
    if (post.reportedBy.includes(req.user.id))
      return res.status(400).json({ message: "You have already reported this post." });

    // Track who reported and store their reason for admin review
    post.reportedBy.push(req.user.id);
    post.reports.push({ user: req.user.id, reason: reason.trim() });

    // Auto-flag the post when it reaches 5 unique reports
    if (post.reportedBy.length >= 5) post.moderationStatus = "flagged";

    await post.save();
    res.json({ message: "Post reported. Thank you for helping keep the community safe." });

    siteLog({ userId: req.user._id, username: req.user.username, action: "Post Reported", targetUsername: post.author?.username || "", detail: reason, sourceType: "post", sourceId: post._id, sourceUrl: `/post/${post._id}` });

    // Notify admins in real-time
    const { getIo } = await import("../utils/socketEmitter.js");
    getIo()?.to("admins").emit("mod:report", { type: "post", postId: post._id });
  } catch (err) {
    console.error("❌ Report Post Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── REPORT COMMENT ───────────────────────────────────────────────────────────

/**
 * POST /api/posts/:id/comments/:commentId/report  (protected)
 *
 * Submits a user report against a specific comment on a post.
 * Users cannot report their own comments, and can only report each comment once.
 *
 * Route params:
 *  @param {string} id        - MongoDB ObjectId of the parent post
 *  @param {string} commentId - MongoDB ObjectId of the comment (subdocument)
 *
 * Body params:
 *  @param {string} reason - Required description of the violation
 *
 * Responds with: { message }
 *
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 */
export const reportComment = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ message: "A reason is required to report a comment." });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Users cannot report their own comments
    if (comment.author.toString() === req.user.id)
      return res.status(400).json({ message: "You cannot report your own comment." });

    // Prevent duplicate reports from the same user
    if (comment.reportedBy.includes(req.user.id))
      return res.status(400).json({ message: "You have already reported this comment." });

    comment.reportedBy.push(req.user.id);
    comment.reports.push({ user: req.user.id, reason: reason.trim() });
    await post.save();

    res.json({ message: "Comment reported. Thank you for helping keep the community safe." });
    siteLog({ userId: req.user._id, username: req.user.username, action: "Comment Reported", detail: reason.trim().slice(0, 80), sourceType: "post", sourceId: post._id, sourceUrl: `/post/${post._id}` });

    // Notify admins in real-time
    const { getIo } = await import("../utils/socketEmitter.js");
    getIo()?.to("admins").emit("mod:report", { type: "comment", postId: post._id });
  } catch (err) {
    console.error("❌ Report Comment Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
