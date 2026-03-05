import User from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Generate JWT
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Basic validators
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isStrongPassword = (pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
const isValidUsername = (u) => u.length >= 2 && u.length <= 30 && /^[a-zA-Z0-9_]+$/.test(u);

// REGISTER
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ message: "All fields are required" });
    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string")
      return res.status(400).json({ message: "Invalid input" });
    if (!isValidUsername(username.trim()))
      return res.status(400).json({ message: "Username must be 2–30 characters (letters, numbers, underscores)" });
    if (!isValidEmail(email.trim()))
      return res.status(400).json({ message: "Invalid email address" });
    if (!isStrongPassword(password))
      return res.status(400).json({ message: "Password must be 8+ characters with at least one uppercase letter and one number" });

    const userExists = await User.findOne({ email: email.trim().toLowerCase() });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
    });

    res.status(201).json({
      id: user._id,
      username: user.username,
      email: user.email,
      isSubscriber: user.isSubscriber || false,
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("❌ Signup Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// LOGIN
export const loginUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password)
      return res.status(400).json({ message: "Credentials required" });
    if (typeof password !== "string")
      return res.status(400).json({ message: "Invalid input" });

    const query = {};
    if (email && typeof email === "string") query.email = email.trim().toLowerCase();
    else if (username && typeof username === "string") query.username = username.trim();
    else return res.status(400).json({ message: "Invalid input" });

    const user = await User.findOne(query);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) return res.status(401).json({ message: "Invalid credentials" });

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      isSubscriber: user.isSubscriber || false,
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET USER PROFILE
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      isSubscriber: user.isSubscriber || false,
    });
  } catch (err) {
    console.error("❌ Get Profile Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// UPGRADE TO SUBSCRIBER
export const upgradeToSubscriber = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isSubscriber = true;
    await user.save();

    res.json({ message: "Subscription upgraded", isSubscriber: true });
  } catch (err) {
    console.error("❌ Upgrade Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE ACCOUNT
export const deleteUserAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Account Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET DONATIONS TOTAL
export const getDonationsTotal = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("donationsTotal");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ donationsTotal: user.donationsTotal || 0 });
  } catch (err) {
    console.error("❌ Get Donations Total Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE USERNAME
export const updateUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== "string")
      return res.status(400).json({ message: "Username is required" });
    if (!isValidUsername(username.trim()))
      return res.status(400).json({ message: "Username must be 2–30 characters (letters, numbers, underscores)" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.username = username.trim();
    await user.save();

    res.json({ message: "Username updated successfully", username: user.username });
  } catch (err) {
    console.error("❌ Update Username Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
