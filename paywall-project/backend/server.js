// server.js
import express from "express";            
import { config } from "dotenv";          
import { connectDatabase } from "./utils/connectDatabase.js"; 
import userRoutes from "./routes/userRoutes.js";             
import cors from "cors";                  

// 1️⃣ Load environment variables from .env
config();

// 2️⃣ Connect to MongoDB
connectDatabase();

// 3️⃣ Initialize Express app
const app = express();

// 4️⃣ Middleware
app.use(cors());             // Allow frontend to call backend
app.use(express.json());     // Parse JSON payloads

// 5️⃣ Routes
app.use("/api/users", userRoutes); 

// Example test route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// 6️⃣ Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
});

// 7️⃣ Start server on dynamic port (Render) or 5000 locally
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
