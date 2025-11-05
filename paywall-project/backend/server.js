// server.js
import express from "express";            // Express framework
import { config } from "dotenv";          // For environment variables
import { connectDatabase } from "./utils/connectDatabase.js"; // MongoDB connection
import userRoutes from "./routes/userRoutes.js";             // User/auth routes
import cors from "cors";                  // Allow cross-origin requests

// 1️⃣ Load environment variables from .env
config();

// 2️⃣ Connect to MongoDB
connectDatabase();

// 3️⃣ Initialize Express app
const app = express();

// 4️⃣ Middleware
app.use(cors());             // Enable cross-origin requests (frontend can call backend)
app.use(express.json());     // Parse incoming JSON payloads

// 5️⃣ Routes
app.use("/api/users", userRoutes); // All user routes prefixed with /api/users

// Example test route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// 6️⃣ Error handling middleware (optional but recommended)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
});

// 7️⃣ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
