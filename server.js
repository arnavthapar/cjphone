import express from "express"
import { createServer } from "http"
import { Server } from "socket.io"
import { fileURLToPath } from "url"

import { dirname } from "path"
import path from "path"
import dotenv from "dotenv"
dotenv.config({quiet: true})
const app = express()
const server = createServer(app)
const io = new Server(server)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
app.use(express.json())

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

    const text = await response.text()
    
    try {
        const data = JSON.parse(text)
        res.json(data)
    } catch (e) {
        console.error("Failed to parse Discord response:", text)
        res.status(500).json({ error: text })
    }
})

const rooms = {}
io.on("connection", (socket) => {
    let currentRoom = null
    let currentUser = null

    socket.on("join", ({ roomId, user }) => {
        socket.join(roomId)
        currentRoom = roomId
        currentUser = user
        if (!rooms[roomId]) rooms[roomId] = []
        const isHost = rooms[roomId].length === 0
        if (!rooms[roomId].find(u => u.id === user.id)) {
            rooms[roomId].push(user)
            socket.broadcast.to(roomId).emit("playerJoined", user)
        }
        
        socket.emit("playerList", rooms[roomId])
        socket.emit("role", { isHost })
    })

    socket.on("disconnect", () => {
        if (currentRoom && currentUser && rooms[currentRoom]) {
            rooms[currentRoom] = rooms[currentRoom].filter(u => u.id !== currentUser.id)
            io.to(currentRoom).emit("playerLeft", currentUser)
        }
    })
})

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/phone.html"))
})

server.listen(3000, () => {
    console.log('Server running on port 3000.')
})