import { DiscordSDK } from "@discord/embedded-app-sdk"
import { io } from "socket.io-client"

function addPlayerToList(user) {
    const list = document.getElementById("playerList")
    const li = document.createElement("li")
    li.id = "player-" + user.id
    li.innerHTML = `
        <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png"
            width="32" height="32" class="avatar">
        ${user.username}
    `
    li.classList.add("listItem")
    list.appendChild(li)
}
let playerCount = 0
function updateStartButton() {
    document.getElementById("Start").disabled = playerCount < 2
}
let currentUserId = null
function colorsMatch(a, b, tolerance = 0) {
    return Math.abs(a[0] - b[0]) <= tolerance &&
            Math.abs(a[1] - b[1]) <= tolerance &&
            Math.abs(a[2] - b[2]) <= tolerance &&
            Math.abs(a[3] - b[3]) <= tolerance;
    }

function cssColorToRgba(color) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempCanvas.height = 1;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = color;
    tempCtx.fillRect(0, 0, 1, 1);
    const d = tempCtx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
}
function floodFill(canvas, startX, startY, fillColor) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    // Get all pixel data at once (fast — one read operation)
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const idx = (x, y) => (y * width + x) * 4;

    // Get the target color (color to replace)
    const i = idx(startX, startY);
    const target = [data[i], data[i+1], data[i+2], data[i+3]];

    const fill = cssColorToRgba(fillColor);

    if (colorsMatch(target, fill)) return;

    // BFS stack
    const stack = [[startX, startY]];
    const visited = new Uint8Array(width * height);

    while (stack.length) {
        const [x, y] = stack.pop();

        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (visited[y * width + x]) continue;

        const pi = idx(x, y);
        if (!colorsMatch([data[pi], data[pi+1], data[pi+2], data[pi+3]], target)) continue;

        data[pi]  = fill[0];
        data[pi + 1] = fill[1];
        data[pi + 2] = fill[2];
        data[pi + 3] = fill[3];
        visited[y * width + x] = 1;

        // Push 4 neighbors
        stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
    }

    // Write all changes back in one operation
    ctx.putImageData(imageData, 0, 0);
}

const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")
let drawing = false
document.getElementById("submitSentence").addEventListener("click", () => {
    const sentence = document.getElementById("sentenceInput").value.trim()
    if (sentence) {
        if (sentence.length > 100 || sentence.length === 0) {
            document.getElementById("submitText").textContent = "Sentence must be between 1 and 100 characters."
        } else {
            socket.emit("submitSentence", {roomId: discordSdk.instanceId, sentence})
            document.getElementById("submitText").textContent = "Waiting for other players..."
        document.getElementById("submitSentence").disabled = true
        }
    } else {
        document.getElementById("submitText").textContent = "Please enter a sentence."
    }
})
function checkHost(isHost) {
    if (!isHost) {
        document.getElementById("Start").style.display = "none"
        document.getElementById("startText").textContent = "Waiting for host to start the game..."
    }
}
document.getElementById("submitDrawing").addEventListener("click", () => {
    const dataURL = canvas.toDataURL('image/png')
    socket.emit("submitDrawing", {roomId: discordSdk.instanceId, drawing: dataURL})
    document.getElementById("submitDrawing").disabled = true
    document.getElementById("submitDrawingText").textContent = "Waiting for other players..."
})
let tool = "brush"
let color = "black"
// Mouse events
canvas.addEventListener("mousedown", (e) => {
    drawing = true
    if (tool === "fill") {
        floodFill(canvas, e.offsetX, e.offsetY, color)
        return
    }
    ctx.beginPath()
    ctx.strokeStyle = color;
    ctx.moveTo(e.offsetX, e.offsetY)
})
canvas.addEventListener("mousemove", (e) => {
    if (!drawing) return
    if (tool === "fill" ) return
    ctx.lineTo(e.offsetX, e.offsetY)
    ctx.stroke()
})
canvas.addEventListener("mouseup", () => drawing = false)
canvas.addEventListener("mouseleave", () => drawing = false)

// Touch events for mobile
canvas.addEventListener("touchstart", (e) => {
    e.preventDefault()
    const touch = e.touches[0]
    const rect = canvas.getBoundingClientRect()
    drawing = true
    if (tool === "fill" ) {
        floodFill(canvas, Math.floor(touch.clientX - rect.left), Math.floor(touch.clientY - rect.top), color)
        return
    }
    ctx.beginPath()
    ctx.strokeStyle = color;
    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top)
})
canvas.addEventListener("touchmove", (e) => {
    e.preventDefault()
    if (!drawing) return
    const touch = e.touches[0]
    if (tool === "fill" ) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top)
    ctx.stroke()
})
function getRichPresence() {
    const states = {
        lobby: "In a lobby",
        playing: "Round in progress",
        results: "Viewing results"
    }
    discordSdk.commands.setActivity({
        activity: {
            type: 0,
            details: "Playing CjPhone",
            state: states[gamePhase],
            party: {
                id: discordSdk.instanceId,
                size: [playerCount, Math.max(5, playerCount)]
            }
        }
    })
}
canvas.addEventListener("touchend", () => drawing = false)
const socket = io()
socket.on("playerJoined", (user) => {
    addPlayerToList(user)
    playerCount++
    updateStartButton()
    getRichPresence()
})

socket.on("drawThis", (sentence) => {
    document.getElementById("submitDrawingText").textContent = ""
    document.getElementById("guess").classList.add("force-hidden")
    document.getElementById("submitText").textContent = ""
    document.getElementById("sentenceInput").value = ""
    document.getElementById("sentence").classList.add("force-hidden")
    const drawingDiv = document.getElementById("drawing")
    drawingDiv.classList.remove("force-hidden")
    document.getElementById("drawingPrompt").textContent = `Draw: "${sentence}"`

})
socket.on("gameOver", (chains) => {
    document.getElementById("drawing").classList.add("force-hidden")
    document.getElementById("guess").classList.add("force-hidden")
    document.getElementById("sentence").classList.add("force-hidden")
    document.getElementById("gameOver").classList.remove("force-hidden")

    const container = document.getElementById("chains")
    container.innerHTML = ""

    chains.forEach(chain => {
        const chainDiv = document.createElement("div")
        chainDiv.classList.add("chain")

        const title = document.createElement("h3")
        title.textContent = `${chain.originalUser.username}'s chain`
        chainDiv.appendChild(title)

        chain.entries.forEach(entry => {
            const entryDiv = document.createElement("div")
            entryDiv.classList.add("chain-entry")

            const author = document.createElement("p")
            author.classList.add("chain-author")
            author.textContent = entry.user.username

            if (entry.type === "sentence") {
                const text = document.createElement("p")
                text.classList.add("chain-text")
                text.textContent = `"${entry.text}"`
                entryDiv.appendChild(author)
                entryDiv.appendChild(text)
            } else {
                const img = document.createElement("img")
                img.src = entry.image
                img.classList.add("chain-image")
                entryDiv.appendChild(author)
                entryDiv.appendChild(img)
            }

            chainDiv.appendChild(entryDiv)
        })

        container.appendChild(chainDiv)
    })
    await discordSdk.commands.setActivity({
        activity: {
            type: 0,
            details: "Playing CjPhone",
            state: "Viewing results",
            timestamps: {
                start: Date.now()
            },
            party: {
                id: discordSdk.instanceId,
                size: [playerCount, 5]
            }
        }
    })
})

socket.on("guessThis", (image) => {
    document.getElementById("drawing").classList.add("force-hidden")
    document.getElementById("guess").classList.remove("force-hidden")
    const img = document.getElementById("referenceImage")
    img.src = image
    img.style.display = "block"
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById("submitDrawing").disabled = false
    document.getElementById("guessInput").disabled = false
    document.getElementById("submitGuess").disabled = false
    document.getElementById("submitGuessText").textContent = ""
})
document.getElementById("submitGuess").addEventListener("click", () => {
    const guess = document.getElementById("guessInput").value.trim()
    if (guess) {
        socket.emit("submitSentence", {roomId: discordSdk.instanceId, sentence: guess})
        document.getElementById("guessInput").disabled = true
        document.getElementById("submitGuess").disabled = true
        document.getElementById("submitGuessText").textContent = "Waiting for other players..."
    }
})

// List all players upon joining
socket.on("playerList", (players) => {
    const list = document.getElementById("playerList")
    list.innerHTML = ""
    players.forEach(user => {
        addPlayerToList(user);
        playerCount++
    })
    updateStartButton()
});
socket.on("newHost", (newHost) => {
    if (newHost.id === currentUserId) {
        // I'm the new host
        document.getElementById("Start").style.display = "block"
        document.getElementById("startText").textContent = ""
    }
})
socket.on("playerLeft", (user, isHost) => {
    document.getElementById("player-" + user.id)?.remove()
    playerCount--
    updateStartButton()
    if (playerCount < 2) {
        document.getElementById("Start").disabled = true
    }
    getRichPresence()

})
socket.on("role", ({ isHost }) => {
    checkHost(isHost)
})
let discordSdk


discordSdk = new DiscordSDK("1498403668087799958")

if (discordSdk) {

let authenticated = false
// Track start button
document.getElementById("Start").addEventListener("click", () => {
    socket.emit("startGame", { roomId: discordSdk.instanceId })
})
document.querySelectorAll(".color-btn").forEach(el => {
    el.addEventListener("click", () => {
        color = el.dataset.color
        if (color === "white") {
            ctx.lineWidth = 10
        } else {
            ctx.lineWidth = 2
        }
    })
})
document.querySelectorAll(".tool-btn").forEach(el => {
    el.addEventListener("click", () => {
        tool = el.dataset.tool
    })
})
socket.on("gameStarted", () => {
    document.getElementById("menu").style.display = "none"
    document.getElementById("game").classList.remove("force-hidden")
    await discordSdk.commands.setActivity({
        activity: {
            type: 0,
            details: "Playing CjPhone",
            state: "Currenly playing",
            timestamps: {
                start: Date.now()
            },
            party: {
                id: discordSdk.instanceId,
                size: [playerCount, 5]
            }
        }
    })
})
document.getElementById("sentenceInput").addEventListener("input", (e) => {
    const len = e.target.value.length
    document.getElementById("charCount").textContent = `${len}/100 characters used`
})
async function init() {
    try {
        await discordSdk.ready()
        const { code } = await discordSdk.commands.authorize({
            client_id: "1498403668087799958",
            response_type: "code",
            state: "",
            prompt: "none",
            scope: ["identify", "guilds.members.read"],
        })
        const response = await fetch("/api/token", {
            method: "POST",
            body: JSON.stringify({ code }),
            headers: { "Content-Type": "application/json" }
        })

        const { access_token } = await response.json()
        
        let result
        if (!authenticated) {
            result = await discordSdk.commands.authenticate({ access_token })
            authenticated = true
        }
        currentUserId = result.user.id

        const { participants } = await discordSdk.commands.getInstanceConnectedParticipants()
        const currentUser = participants.find(p => p.id === currentUserId) || participants[0]

        socket.emit("join", {
            roomId: discordSdk.instanceId,
            user: {
                id: currentUser.id,
                username: currentUser.global_name || currentUser.username,
                avatar: currentUser.avatar
            }
        })
        await discordSdk.commands.setActivity({
            activity: {
                type: 0, // Playing
                details: "Playing CjPhone",
                state: "In a lobby",
                timestamps: {
                    start: Date.now()
                },
                party: {
                    id: discordSdk.instanceId,
                    size: [playerCount, 5]
                }
            }
        })
    } catch (e) {
        if (e.code === 4002) return // already authenticated, don't retry
        console.error("Initialization error:", e)
        setTimeout(init, 1000)
    }
}
    init()
}
