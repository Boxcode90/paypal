const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// 🔐 ENV VARIABLES
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;

// 🌐 LIVE PAYPAL BASE URL
const BASE = "https://api-m.paypal.com";

// 🔑 Get access token
async function getAccessToken() {
  const response = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization":
        "Basic " +
        Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();

  if (!data.access_token) {
    console.error("Failed to get access token:", data);
    throw new Error("Auth failed");
  }

  return data.access_token;
}

// 🧾 CREATE ORDER
app.post("/create-order", async (req, res) => {
  try {
    const { amount, currency } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const accessToken = await getAccessToken();

    const response = await fetch(`${BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency || "USD",
              value: amount,
            },
          },
        ],
      }),
    });

    const data = await response.json();

    if (!data.id) {
      console.error("Order creation failed:", data);
      return res.status(500).json({ error: "Order creation failed", details: data });
    }

    res.json(data);
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 💰 CAPTURE ORDER
app.post("/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body;

    if (!orderID) {
      return res.status(400).json({ error: "Missing orderID" });
    }

    const accessToken = await getAccessToken();

    const response = await fetch(`${BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (!data.status || data.status !== "COMPLETED") {
      console.error("Capture failed:", data);
      return res.status(500).json({ error: "Capture failed", details: data });
    }

    res.json(data);
  } catch (err) {
    console.error("Capture error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});