const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Use CORS middleware
app.use(cors());

// API details
const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImY2YTRhMTBiLWY3ZDktNDQzOC05MTcwLTI5MzhiOGUwNDRiMyIsIm5vbmNlIjoiMWExZGFiNzUtMDYxOC00YjE2LWE1NDQtNTI5YmM4ZmM3NjVmIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzU0NDIyNjIwfQ.AEaxl65j_SAdnKwTMtIJ5L4O_I6m3wVVcSGZiju0rCA";
const userId = "f6a4a10b-f7d9-4438-9170-2938b8e044b3";

let leaderboardCache = [];       // current month
let prevLeaderboardCache = [];   // previous month

// Mask username (e.g., azisai205 → az***05)
function formatUsername(username = "") {
  if (username.length <= 4) return username;
  return `${username.slice(0, 2)}***${username.slice(-2)}`;
}

// Generic month bounds in UTC with offset from current month
// offsetMonths = 0 (current), -1 (previous), +1 (next), etc.
function getMonthBoundsUTC(offsetMonths = 0) {
  // Force UTC perspective
  const nowUTC = new Date(new Date().toISOString());
  const y = nowUTC.getUTCFullYear();
  const m = nowUTC.getUTCMonth() + offsetMonths;

  // Start = 1st 00:00:00.000 UTC
  const startDateObj = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  // End   = last day 23:59:59.999 UTC
  const endDateObj = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));

  return {
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
    debugMonth: { year: startDateObj.getUTCFullYear(), monthIndex0: startDateObj.getUTCMonth() }
  };
}

async function fetchRange({ startDate, endDate, label }) {
  const response = await axios.get(apiUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
    params: { userId, startDate, endDate },
  });

  const raw = Array.isArray(response.data) ? response.data : [];
  const data = raw
    .filter((p) => p && p.username && p.username !== "azisai205")
    .sort((a, b) => (b.weightedWagered || 0) - (a.weightedWagered || 0))
    .slice(0, 100000)
    .map((p) => ({
      username: formatUsername(p.username),
      wagered: Math.round(Number(p.weightedWagered || 0)),
      weightedWager: Math.round(Number(p.weightedWagered || 0)),
    }));

  console.log(
    `[${label}] ${new Date().toISOString()} items=${data.length} range=${startDate} → ${endDate}`
  );
  return data;
}

// Fetch current month
async function fetchLeaderboardData() {
  try {
    const { startDate, endDate } = getMonthBoundsUTC(0);
    leaderboardCache = await fetchRange({ startDate, endDate, label: "current" });
  } catch (error) {
    console.error("Error fetching current-month data:", error.message);
  }
}

// Fetch previous month (static-ish; refresh daily just in case)
async function fetchPrevLeaderboardData() {
  try {
    const { startDate, endDate } = getMonthBoundsUTC(-1);
    prevLeaderboardCache = await fetchRange({ startDate, endDate, label: "prev" });
  } catch (error) {
    console.error("Error fetching previous-month data:", error.message);
  }
}

// Routes
app.get("/", (req, res) => {
  res.send("Welcome to the Leaderboard API. Endpoints: /leaderboard, /leaderboard/top14?n=14, /leaderboard/prev, /leaderboard/prev/top14?n=14");
});

app.get("/leaderboard", (req, res) => {
  res.json(leaderboardCache);
});

app.get("/leaderboard/top14", (req, res) => {
  const n = Number(req.query.n || 14);
  const top = leaderboardCache.slice(0, n);
  if (top.length >= 2) [top[0], top[1]] = [top[1], top[0]];
  res.json(top);
});

app.get("/leaderboard/prev", (req, res) => {
  res.json(prevLeaderboardCache);
});

app.get("/leaderboard/prev/top14", (req, res) => {
  const n = Number(req.query.n || 14);
  const top = prevLeaderboardCache.slice(0, n);
  if (top.length >= 2) [top[0], top[1]] = [top[1], top[0]];
  res.json(top);
});

// Initial fetches + refresh intervals
fetchLeaderboardData();
fetchPrevLeaderboardData();

// Current month refresh every 5 min
setInterval(fetchLeaderboardData, 5 * 60 * 1000);

// Previous month refresh once a day (safety)
setInterval(fetchPrevLeaderboardData, 24 * 60 * 60 * 1000);

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// Self-ping to stay alive (make sure this points to YOUR service URL, not someone else's)
setInterval(() => {
  axios
    .get(`http://localhost:${PORT}/leaderboard/top14?n=1`)
    .then(() => console.log("Self-ping ok"))
    .catch((err) => console.error("Self-ping failed:", err.message));
}, 4 * 60 * 1000);
