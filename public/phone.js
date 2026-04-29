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

const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")
let drawing = false
document.getElementById("submitSentence").addEventListener("click", () => {
    const sentence = document.getElementById("sentenceInput").value.trim()
    if (sentence) {
        const response = socket.emit("submitSentence", {roomId: discordSdk.instanceId, sentence})
        if (response) {
            document.getElementById("submitText").textContent = "Waiting for other players..."
            document.getElementById("submitSentence").disabled = true
        } else {
            document.getElementById("submitText").textContent = "Sentence must be between 1 and 100 characters."
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
let color = "black"
// Mouse events
canvas.addEventListener("mousedown", (e) => {
    drawing = true
    ctx.beginPath()
    ctx.strokeStyle = color;
    ctx.moveTo(e.offsetX, e.offsetY)
})
canvas.addEventListener("mousemove", (e) => {
    if (!drawing) return
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
    ctx.beginPath()
    ctx.strokeStyle = color;
    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top)
})
canvas.addEventListener("touchmove", (e) => {
    e.preventDefault()
    if (!drawing) return
    const touch = e.touches[0]
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top)
    ctx.stroke()
})
canvas.addEventListener("touchend", () => drawing = false)
const socket = io()
socket.on("playerJoined", (user) => {
    addPlayerToList(user)
    playerCount++
    updateStartButton()
})

socket.on("allSentencesSubmitted", (sentences) => {
    document.getElementById("submitText").textContent = ""
    document.getElementById("sentenceInput").value = ""
    document.getElementById("sentence").classList.add("force-hidden")
    const drawingDiv = document.getElementById("drawing")
    drawingDiv.classList.remove("force-hidden")
})
socket.on("drawThis", (sentence) => {
    document.getElementById("drawingPrompt").textContent = `Draw: "${sentence}"`
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
        if (el.dataset.color === "white") {
            ctx.lineWidth = 10
        } else {
            ctx.lineWidth = 2
        }
    })
})
socket.on("gameStarted", () => {
    document.getElementById("menu").style.display = "none"
    document.getElementById("game").classList.remove("force-hidden")
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
    } catch (e) {
        if (e.code === 4002) return // already authenticated, don't retry
        console.error("Initialization error:", e)
        setTimeout(init, 1000)
    }
}
    init()
}
