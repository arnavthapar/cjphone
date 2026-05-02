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
        if (data.error) {
            console.error("Discord token exchange error:", data)
            return res.status(400).json({error: data.error_description || "Unknown error"})
        }
        res.json(data)
    } catch (e) {
        console.error("Failed to parse Discord response:", text)
        res.status(500).json({error: text})
    }
})
const gameStates = {} // Track game state per room
const sentences = {}
const drawings = {}
const rooms = {}
const chains = {}
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
            // Tell the new host they're now host
            io.to(currentRoom).emit("playerLeft", currentUser)
            io.to(currentRoom).emit("newHost", rooms[currentRoom][0])
        } else {
            io.to(currentRoom).emit("playerLeft", currentUser)
        }
        if (rooms[currentRoom].length === 0) {
            delete rooms[currentRoom]
            delete gameStates[currentRoom]
            delete sentences[currentRoom]
        }

    }
})

    socket.on("startGame", ({roomId}) => {
        if (!rooms[roomId]) return
        if (rooms[roomId][0].id !== currentUser.id) return
        if (rooms[roomId].length < 2) return
        if (gameStates[roomId]) return
        chains[roomId] = []
        gameStates[roomId] = {phase: "sentence", round:0, maxRounds: rooms[roomId].length}
        io.to(roomId).emit("gameStarted")
    })

    socket.on("submitSentence", ({roomId, sentence}) => {
    if (!gameStates[roomId]) return
    if (gameStates[roomId].phase !== "sentence") return
    if (sentence.length === 0 || sentence.length > 100) return
    if (!sentences[roomId]) sentences[roomId] = []
    if (sentences[roomId].find(s => s.user.id === currentUser.id)) return

    sentences[roomId].push({user: currentUser, text: sentence})

    if (sentences[roomId].length >= rooms[roomId].length) {
        gameStates[roomId].phase = "drawing"

        const ordered = rooms[roomId].map(user =>
            sentences[roomId].find(s => s.user.id === user.id)
        )
        const rotated = [...ordered.slice(1), ordered[0]]
        sentences[roomId] = rotated
        if (gameStates[roomId].round === 0) {
            // build initial chains in player order BEFORE rotating
            rotated.forEach(s => {
                chains[roomId].push({ originalUser: s.user, entries: [{ type: "sentence", user: s.user, text: s.text }] })
            })
        }

        if (gameStates[roomId].round > 0) {
            const rotated_new = [...rotated.slice(1), rotated[0]]
            rotated_new.forEach((s, i) => {
                if (chains[roomId][i]) {
                    chains[roomId][i].entries.push({ type: "sentence", user: s.user, text: s.text })
                }
            })
        }
        gameStates[roomId].round++


        rooms[roomId].forEach((user, i) => {
            const userSocket = [...io.sockets.sockets.values()].find(s => s.currentUser?.id === user.id)
            if (userSocket) {
                userSocket.emit("drawThis", sentences[roomId][i].text)
            }
        })
        drawings[roomId] = []
    }
    if (gameStates[roomId].round >= gameStates[roomId].maxRounds) {
        // game over, everyone has seen their chain come back around
        gameStates[roomId].phase = "ended"

        io.to(roomId).emit("gameOver", chains[roomId])
        delete chains[roomId]
        sentences[roomId] = []
        drawings[roomId] = []
        return
    }
})
    socket.on("submitDrawing", ({roomId, drawing}) => {
        if (!gameStates[roomId]) return
        if (gameStates[roomId].phase !== "drawing") return
        // Store drawings and also store who submitted them for later attribution
        if (!drawings[roomId]) drawings[roomId] = []
        if (drawings[roomId].find(s => s.user.id === currentUser.id)) return
        drawings[roomId].push({user: currentUser, text: drawing, image: drawing})
        // Check if all players have submitted
        let ordered;
        if (drawings[roomId].length >= rooms[roomId].length) {
            gameStates[roomId].phase = "sentence"
            ordered = rooms[roomId].map(user =>
                drawings[roomId].find(d => d.user.id === user.id)
            )
            ordered.forEach((d, i) => {
                if (chains[roomId][i]) {
                    chains[roomId][i].entries.push({ type: "drawing", user: d.user, image: d.image })
                }
            })
            const rotated = [...ordered.slice(1), ordered[0]]
            drawings[roomId] = rotated
            rooms[roomId].forEach((user, i) => {
                const userSocket = [...io.sockets.sockets.values()].find(s => s.currentUser?.id === user.id)
                if (userSocket) {
                    userSocket.emit("guessThis", drawings[roomId][i].image)
                }
            })
            sentences[roomId] = []
            gameStates[roomId].round++

            if (gameStates[roomId].round >= gameStates[roomId].maxRounds) {
                // game over, everyone has seen their chain come back around
                gameStates[roomId].phase = "ended"

                io.to(roomId).emit("gameOver", chains[roomId])
                delete chains[roomId]
                sentences[roomId] = []
                drawings[roomId] = []
                return
            }
        }
    })
})


app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/phone.html"))
})

server.listen(3000, () => {
    console.log('Server running on port 3000.')
})