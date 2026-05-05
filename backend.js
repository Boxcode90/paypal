const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

// Validate required environment variables
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
  console.error("❌ Missing required environment variables: PAYPAL_CLIENT_ID or PAYPAL_SECRET");
  process.exit(1);
}

const app = express();

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || "https://payments.themvpgarage.com"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.options("*", cors()); // 🔥 critical for preflight

app.use(express.json());
const PORT = process.env.PORT || 3000;

// PayPal live credentials
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API_BASE = "https://api-m.paypal.com";

const ALLOWED_CURRENCIES = ["USD", "AUD", "CAD", "GBP"];

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get access token from PayPal
async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (!data.access_token) {
    console.error("Failed to get access token:", data);
    throw new Error("PayPal authentication failed");
  }
  return data.access_token;
}

// Create order
app.post("/create-order", async (req, res) => {
  try {
    let { amount, currency } = req.body;

    // Validate amount
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount. Must be a positive number." });
    }

    // Validate currency
    if (!currency || !ALLOWED_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: `Unsupported currency. Allowed: ${ALLOWED_CURRENCIES.join(", ")}` });
    }

    // Format amount to 2 decimal places
    const formattedAmount = numericAmount.toFixed(2);

    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
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
              currency_code: currency,
              value: formattedAmount,
            },
          },
        ],
      }),
    });

    const data = await response.json();

    if (!data.id) {
      console.error("PayPal order creation failed:", data);
      return res.status(500).json({ error: "Failed to create PayPal order" });
    }

    res.json({ id: data.id });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Capture order
app.post("/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body;

    if (!orderID) {
      return res.status(400).json({ error: "Missing orderID" });
    }

    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (!data.status || data.status !== "COMPLETED") {
      console.error("PayPal capture failed:", data);
      return res.status(500).json({ error: "Failed to capture payment" });
    }

    res.json({ status: "COMPLETED", capture_id: data.id });
  } catch (err) {
    console.error("Capture order error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PayPal Live backend running on port ${PORT}`);
});
