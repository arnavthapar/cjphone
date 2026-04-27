import express from "express"
import { createServer } from "http"
import { Server } from "socket.io"

const app = express()
const server = createServer(app)
const io = new Server(server)

app.use(express.json())

// Serve your frontend files
app.use(express.static("public"))

// Token exchange endpoint for Discord OAuth
app.post("/api/token", async (req, res) => {
    const { code } = req.body

    const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: "authorization_code",
            code,
        })
    })

    const { access_token } = await response.json()
    res.json({ access_token })
})

// Socket.io game logic
io.on("connection", (socket) => {
    socket.on("join", (roomId) => {
        socket.join(roomId)
    })

    socket.on("submit", ({ roomId, drawing }) => {
        // store drawing, check if all players submitted, etc.
    })
})

server.listen(3000, () => {
    console.log('Server running on port 3000.')
})