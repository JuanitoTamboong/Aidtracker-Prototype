import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import http from "http";
import bcrypt from "bcryptjs";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------ MIDDLEWARE ------------------ //
app.use(cors());
app.use(express.json({ limit: "100mb" })); // increase JSON limit for base64 images
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // serve uploaded photos

// ------------------ FILE PATHS ------------------ //
const REPORTS_FILE = path.join(__dirname, "reports.json");
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");


// ------------------ PAGE ROUTES ------------------ //
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "home.html")));
app.get("/map", (req, res) => res.sendFile(path.join(__dirname, "map.html")));
app.get("/notif", (req, res) => res.sendFile(path.join(__dirname, "notif.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "register.html")));


// ------------------ AUTH ROUTES ------------------ //
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, "[]");
  const users = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));

  if (users.find((user) => user.username === username)) {
    return res.json({ success: false, message: "Username already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ username, password: hashedPassword });
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(users, null, 2));

  res.json({ success: true });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, "[]");
  const users = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
  const user = users.find((user) => user.username === username);

  if (!user) return res.json({ success: false });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ success: false });

  res.json({ success: true });
});


// ------------------ REPORT ROUTES ------------------ //
app.get("/api/reports", (req, res) => {
  if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, "[]");
  const data = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));
  res.json(data);
});

app.post("/api/reports", (req, res) => {
  if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, "[]");
  const data = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));

  const report = req.body;
  report.reporter = report.reporter || "Unknown";

  // ✅ Handle Base64 photo (if provided)
  if (report.photo) {
  try {
    const matches = report.photo.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches || matches.length !== 3) throw new Error("Invalid base64 data");

    const mimeType = matches[1];              // e.g., image/jpeg
    const imageData = matches[2];
    const ext = mimeType.split("/")[1];       // -> jpeg, png, etc.
    const fileName = `report_${Date.now()}.${ext}`;
    const uploadDir = path.join(__dirname, "uploads");

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(imageData, "base64"));

    report.photo = `uploads/${fileName}`;     // relative path served by Express
  } catch (err) {
    console.error("⚠️ Failed to save photo:", err);
    report.photo = null;
  }
}

  data.push(report);
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2));

  io.emit("newReport", report);
  res.json({ message: "Report saved successfully", report });
});


// ------------------ START SERVER ------------------ //
server.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
