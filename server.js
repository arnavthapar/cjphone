import express from "express"
import {createServer} from "http"
import {Server} from "socket.io"
import {fileURLToPath} from "url"

import {dirname} from "path"
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
    const {code} = req.body

    const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
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
        res.status(500).json({error: text})
    }
})
const gameStates = {} // track game state per room
const sentences = {}
const rooms = {}
io.on("connection", (socket) => {
    let currentRoom = null
    let currentUser = null

    socket.on("join", ({roomId, user}) => {
        socket.currentUser = user
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
        socket.emit("role", {isHost})
    })

    socket.on("disconnect", () => {
    if (currentRoom && currentUser && rooms[currentRoom]) {
        const wasHost = rooms[currentRoom][0]?.id === currentUser.id
        rooms[currentRoom] = rooms[currentRoom].filter(u => u.id !== currentUser.id)
        
        if (wasHost && rooms[currentRoom].length > 0) {
            // tell the new host they're now host
            io.to(currentRoom).emit("playerLeft", currentUser)
            io.to(currentRoom).emit("newHost", rooms[currentRoom][0])
        } else {
            io.to(currentRoom).emit("playerLeft", currentUser)
        }
    }
})

    socket.on("startGame", ({roomId}) => {
        if (!rooms[roomId]) return
        if (rooms[roomId][0].id !== currentUser.id) return
        if (rooms[roomId].length < 2) return
        if (gameStates[roomId]) return
        
        gameStates[roomId] = {phase: "sentence"}
        io.to(roomId).emit("gameStarted")
    })

    socket.on("submitSentence", ({roomId, sentence}) => {
        if (!gameStates[roomId]) return
        if (gameStates[roomId].phase !== "sentence") return
        if (sentence.length === 0 || sentence.length > 100) return
        // Store sentences and also store who submitted them for later attribution
        if (!sentences[roomId]) sentences[roomId] = []
        sentences[roomId].push({user: currentUser, text: sentence})
        // Check if all players have submitted
        if (sentences[roomId].length >= rooms[roomId].length) {
            gameStates[roomId].phase = "drawing"

            const rotated = [...sentences[roomId].slice(1), sentences[roomId][0]]
            sentences[roomId] = rotated

            gameStates[roomId].assignments = sentences[roomId].map(s => s.user.id)

            rooms[roomId].forEach((user, i) => {
                const userSocket = [...io.sockets.sockets.values()].find(s => s.currentUser?.id === user.id)
                if (userSocket) {
                    userSocket.emit("drawThis", sentences[roomId][i].text)
                }
            })

            io.to(roomId).emit("allSentencesSubmitted", sentences[roomId])
        }
    })
    socket.on("submitDrawing", ({roomId, drawing}) => {
        if (!gameStates[roomId]) return
        if (gameStates[roomId].phase !== "drawing") return
    })
})


app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/phone.html"))
})

server.listen(3000, () => {
    console.log('Server running on port 3000.')
})