const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Use CORS middleware
app.use(cors());

// API details
const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE1ZThlYzNmLTkwZDEtNDEzNy1iNGJkLWJhN2M0MjFjMjVlMiIsIm5vbmNlIjoiNDE5MmI1MTctOGMzYy00ZjBjLTg2MzEtYzNiOWEyNGNiZmFjIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzQ3MTg3MTUxfQ.Qr7j1PEqSL5cVb7RuMXXLv1IDv4gvY98pUUU9Ca1pBM";
const userId = "15e8ec3f-90d1-4137-b4bd-ba7c421c25e2";

let leaderboardCache = [];

// Mask username (e.g., azisai205 → az***05)
function formatUsername(username = "") {
  if (username.length <= 4) return username;
  return `${username.slice(0, 2)}***${username.slice(-2)}`;
}

// Get current month bounds in UTC
function getCurrentMonthBoundsUTC() {
  const nowUTC = new Date(new Date().toISOString()); // force UTC view
  const y = nowUTC.getUTCFullYear();
  const m = nowUTC.getUTCMonth();

  const startDateObj = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  // last day of month at 23:59:59.999 UTC
  const endDateObj = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));

  return { startDate: startDateObj.toISOString(), endDate: endDateObj.toISOString() };
}

// Fetch and process leaderboard data (monthly)
async function fetchLeaderboardData() {
  try {
    const { startDate, endDate } = getCurrentMonthBoundsUTC();

    const response = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { userId, startDate, endDate },
    });

    const data = Array.isArray(response.data) ? response.data : [];

    leaderboardCache = data
      .filter((p) => p && p.username && p.username !== "azisai205")
      .sort((a, b) => (b.weightedWagered || 0) - (a.weightedWagered || 0))
      .slice(0, 100000)
      .map((p) => ({
        username: formatUsername(p.username),
        wagered: Math.round(Number(p.weightedWagered || 0)),
        weightedWager: Math.round(Number(p.weightedWagered || 0)),
      }));

    console.log(
      `Leaderboard updated (${new Date().toISOString()}):`,
      `items=${leaderboardCache.length}`,
      `range=${startDate} → ${endDate}`
    );
  } catch (error) {
    console.error("Error fetching leaderboard data:", error.message);
  }
}

// Routes
app.get("/", (req, res) => {
  res.send("Welcome to the Leaderboard API. Endpoints: /leaderboard, /leaderboard/top14");
});

app.get("/leaderboard", (req, res) => {
  res.json(leaderboardCache);
});

app.get("/leaderboard/top14", (req, res) => {
  const top14 = leaderboardCache.slice(0, 10);

  // Swap 1st and 2nd (if present)
  if (top14.length >= 2) {
    [top14[0], top14[1]] = [top14[1], top14[0]];
  }

  res.json(top14);
});

// Initial fetch + refresh every 5 minutes
fetchLeaderboardData();
setInterval(fetchLeaderboardData, 5 * 60 * 1000);

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// Self-ping to stay alive
setInterval(() => {
  axios
    .get("https://andysobdata.onrender.com/leaderboard/top14")
    .then(() => console.log("Self-ping successful."))
    .catch((err) => console.error("Self-ping failed:", err.message));
}, 4 * 60 * 1000);
