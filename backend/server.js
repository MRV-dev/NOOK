const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const dns = require("node:dns");
const http = require("node:http");
const { Server } = require("socket.io");
const attachChatSockets = require("./socket/chatSocket");

dotenv.config({ path: path.join(__dirname, ".env") });

const dnsServers = process.env.DNS_SERVERS?.split(",")
  .map((server) => server.trim())
  .filter(Boolean);
if (dnsServers?.length) {
  dns.setServers(dnsServers);
}

const userRoutes = require("./routes/userRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const messageRoutes = require("./routes/messageRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});
attachChatSockets(io);
app.set("io", io);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, "dist")));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    dotfiles: "deny",
    index: false,
    setHeaders: (response) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Nook API is running" });
});

app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/conversations", messageRoutes);

app.use((error, req, res, next) => {
  console.error(error);
  const status = error.statusCode || error.status || 500;
  res.status(status).json({
    message: status === 500 ? "Internal server error" : error.message,
  });
});

const PORT = process.env.PORT || 3000;

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  process.env.JWT_SECRET.startsWith("replace_")
) {
  console.error(
    "Set JWT_SECRET to a private random value of at least 32 characters in backend/.env",
  );
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
