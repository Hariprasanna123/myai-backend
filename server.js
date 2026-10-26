
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 10000;

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(express.json({ limit: "20kb" }));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get("/", (req, res) => {
  res.json({ status: "MyAI backend is running" });
});

app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AI service is not configured."
      });
    }

    const messages = req.body?.messages;

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 20 ||
      messages.some(m =>
        !m ||
        !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" ||
        !m.content.trim() ||
        m.content.length > 4000
      ) ||
      messages[messages.length - 1].role !== "user"
    ) {
      return res.status(400).json({
        error: "Please send a valid chat message."
      });
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "MyAI"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [
            {
              role: "system",
              content: "You are MyAI, a helpful assistant. Give clear, accurate answers."
            },
            ...messages
          ],
          max_tokens: 1000
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    if (!response.ok) {
      console.error("OpenRouter returned status:", response.status);
      return res.status(502).json({
        error: "The AI provider could not complete your request. Please try again."
      });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;

    if (typeof answer !== "string" || !answer.trim()) {
      return res.status(502).json({
        error: "The AI provider returned an empty response."
      });
    }

    res.json({ reply: answer });
  } catch (error) {
    console.error("Chat request failed:", error.name);
    res.status(502).json({
      error: "Unable to reach the AI service. Please try again."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MyAI backend listening on port ${PORT}`);
});
      
