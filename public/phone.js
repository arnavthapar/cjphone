import { DiscordSDK } from "https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk/+esm"

const discordSdk = new DiscordSDK(YOUR_CLIENT_ID)

async function init() {
    await discordSdk.ready()

    // Authorize and authenticate
    const { code } = await discordSdk.commands.authorize({
        client_id: YOUR_CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds.members.read"],
    })

    // Exchange code for token via your backend
    const response = await fetch("/api/token", {
        method: "POST",
        body: JSON.stringify({ code }),
        headers: { "Content-Type": "application/json" }
    })
    const { access_token } = await response.json()

    await discordSdk.commands.authenticate({ access_token })

    // Now get participants
    const { participants } = await discordSdk.commands.getInstanceConnectedParticipants()

    const list = document.getElementById("playerList")
    participants.forEach(user => {
        const li = document.createElement("li")
        li.textContent = user.username
        list.appendChild(li)
    })
}

init()