const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state for the latest telemetry reading
let currentTelemetry = {
    h2: 0,
    timestamp: Date.now()
};

// POST endpoint for the ESP8266 to push telemetry
app.post('/telemetry', (req, res) => {
    // Basic API Key check
    if (req.headers["x-api-key"] !== "Alpha9_Secure_Link") {
        return res.status(401).send("Unauthorized");
    }

    if (req.body && typeof req.body.h2 !== 'undefined') {
        currentTelemetry = {
            h2: req.body.h2,
            timestamp: Date.now()
        };
        return res.status(200).send("OK");
    }

    res.status(400).send("Bad Request: Missing 'h2' value");
});

// GET endpoint for the dashboard to poll
app.get('/api/telemetry', (req, res) => {
    res.json(currentTelemetry);
});

app.listen(PORT, () => {
    console.log(`Node.js Relay Server running on port ${PORT}`);
});
