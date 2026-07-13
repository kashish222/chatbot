
document.querySelector("#logout").addEventListener("click", () => {
    window.location.href = new URL('../Login/index1.html', window.location.href).href
})

const prompt = document.querySelector("#prompt")
const submitbtn = document.querySelector("#submit")
const chatContainer = document.querySelector(".chat-container")
const imagebtn = document.querySelector("#image")
const image = document.querySelector("#image img")
const imageinput = document.querySelector("#image input")

// const Api_Url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=AIzaSyBgF7K-2m6sHl_3p8aAWcnjLGNf6AfdGG0"
const Api_Url = "http://localhost:3000/chat"
const FEEDBACK_STORAGE_KEY = "chatbotFeedback"
const FEEDBACK_COMMENTS_KEY = "chatbotFeedbackComments"

let chatHistory = []
let isLoading = false
let pendingImage = {
    mime_type: null,
    data: null
}

const thumbUpSvg = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>`
const thumbDownSvg = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>`

function escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
}

function createMessageId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function buildUserParts(message, imageData) {
    const parts = []

    if (message.trim()) {
        parts.push({ text: message.trim() })
    }

    if (imageData?.data) {
        if (!message.trim()) {
            parts.push({ text: "Please describe what you see in this image." })
        }
        parts.push({
            inline_data: {
                mime_type: imageData.mime_type,
                data: imageData.data
            }
        })
    }

    if (parts.length === 0) {
        parts.push({ text: "Hello" })
    }

    return parts
}

function isGoogleRedirectUrl(uri) {
    return typeof uri === "string" && uri.includes("vertexaisearch.cloud.google.com")
}

function getDomainFromUrl(uri) {
    try {
        return new URL(uri).hostname.replace(/^www\./, "").toLowerCase()
    } catch {
        return null
    }
}

function getDomainFromTitle(title) {
    const cleaned = (title || "").trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    if (/^[\w.-]+\.[a-z]{2,}$/i.test(cleaned)) return cleaned.toLowerCase()
    return null
}

function resolveCitationLink(uri, title) {
    const cleanedUri = (uri || "").trim()

    if (!isGoogleRedirectUrl(cleanedUri)) {
        return cleanedUri
    }

    const domain = getDomainFromTitle(title)
    if (domain) {
        return `https://${domain}`
    }

    if (title?.trim()) {
        return `https://www.google.com/search?q=${encodeURIComponent(title.trim())}`
    }

    return "https://www.google.com"
}

function normalizeCitation(citation) {
    return {
        title: (citation.title || citation.uri || "Source").trim(),
        uri: resolveCitationLink(citation.uri, citation.title)
    }
}

function citationKey(citation) {
    return getDomainFromUrl(citation.uri) || getDomainFromTitle(citation.title) || citation.uri
}

function isDirectUrl(uri) {
    return uri && !isGoogleRedirectUrl(uri)
}

function extractCitations(candidate) {
    const metadata = candidate?.groundingMetadata
    if (!metadata) return []

    const citations = []

    for (const chunk of metadata.groundingChunks || []) {
        const web = chunk.web
        if (!web?.uri) continue

        citations.push(normalizeCitation({
            title: web.title || web.uri,
            uri: web.uri
        }))
    }

    return citations
}

function parseCitationsFromBlock(block) {
    const citations = []
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean)

    for (const line of lines) {
        const markdownMatch = line.match(/^\s*(?:\d+[\.\)]|\[\d+\]|-|\*)\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i)
        if (markdownMatch) {
            const uri = markdownMatch[2].trim()
            if (!isGoogleRedirectUrl(uri)) {
                citations.push(normalizeCitation({ title: markdownMatch[1].trim(), uri }))
            }
            continue
        }

        const urlMatch = line.match(/https?:\/\/[^\s)\]>]+/i)
        if (!urlMatch) continue

        const uri = urlMatch[0].replace(/[.,;]+$/, "")
        let title = line
            .replace(/^\s*(?:\d+[\.\)]|\[\d+\]|-|\*)\s*/, "")
            .replace(uri, "")
            .replace(/^[\s\-–—:|]+/, "")
            .replace(/[\s\-–—:|]+$/, "")
            .trim()

        if (!title) title = uri

        if (isGoogleRedirectUrl(uri)) continue

        citations.push(normalizeCitation({ title, uri }))
    }

    return citations
}

function parseMarkdownLinkCitations(text) {
    const citations = []
    const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
    let match

    while ((match = regex.exec(text)) !== null) {
        const uri = match[2].trim()
        if (isGoogleRedirectUrl(uri)) continue
        citations.push(normalizeCitation({ title: match[1].trim(), uri }))
    }

    return citations
}

function mergeCitations(existing, extra) {
    const byKey = new Map()

    for (const citation of [...existing, ...extra].map(normalizeCitation)) {
        const key = citationKey(citation)
        const current = byKey.get(key)

        if (!current || (isDirectUrl(citation.uri) && !isDirectUrl(current.uri))) {
            byKey.set(key, citation)
        }
    }

    return Array.from(byKey.values())
}

const MAX_CITATIONS = 4

function isUsableCitationUrl(uri) {
    if (!uri || !/^https?:\/\//i.test(uri)) return false
    if (isGoogleRedirectUrl(uri)) return false
    return true
}

function limitCitations(citations) {
    return citations
        .map(normalizeCitation)
        .filter((c) => isUsableCitationUrl(c.uri))
        .sort((a, b) => {
            const score = (c) => {
                if (c.uri.includes("google.com/search")) return 0
                if (getDomainFromUrl(c.uri)) return 2
                return 1
            }
            return score(b) - score(a)
        })
        .slice(0, MAX_CITATIONS)
}

function splitMessageAndCitations(text, groundingCitations) {
    let message = text.replace(/\*\*(.*?)\*\*/g, "$1").trim()
    let citations = []

    const sourcesMatch = message.match(
        /(?:^|\n)(?:#{1,3}\s*)?(?:Sources|References|Citations)\s*:?\s*\n?([\s\S]*)$/i
    )

    if (sourcesMatch) {
        citations = mergeCitations(citations, parseCitationsFromBlock(sourcesMatch[1]))
        message = message.slice(0, sourcesMatch.index).trim()
    }

    citations = mergeCitations(citations, parseMarkdownLinkCitations(message))
    message = message.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")

    const inlineUrls = [...message.matchAll(/https?:\/\/[^\s)\]>]+/g)].map((match) => match[0])
    inlineUrls.forEach((uri, index) => {
        if (isGoogleRedirectUrl(uri)) return
        citations = mergeCitations(citations, [{ title: `Reference ${index + 1}`, uri }])
    })

    if (inlineUrls.length) {
        message = message.replace(/https?:\/\/[^\s)\]>]+/g, "").replace(/\s{2,}/g, " ").trim()
    }

    citations = limitCitations(mergeCitations(citations, groundingCitations))

    return { message, citations }
}

function renderMessageText(message, citations) {
    const div = document.createElement("div")
    div.className = "bot-message-text"

    if (!citations.length) {
        div.textContent = message
        return div
    }

    const parts = message.split(/(\[\d+\])/g)

    parts.forEach((part) => {
        const refMatch = part.match(/^\[(\d+)\]$/)
        if (refMatch) {
            const citation = citations[parseInt(refMatch[1], 10) - 1]
            if (citation) {
                const link = document.createElement("a")
                link.className = "citation-ref"
                link.href = citation.uri
                link.target = "_blank"
                link.rel = "noopener noreferrer"
                link.title = citation.title
                link.textContent = part
                div.appendChild(link)
                return
            }
        }

        div.appendChild(document.createTextNode(part))
    })

    return div
}

function renderCitations(citations) {
    if (!citations.length) return null

    const section = document.createElement("div")
    section.className = "bot-citations"

    const label = document.createElement("p")
    label.className = "citations-label"
    label.textContent = "Sources"

    const list = document.createElement("ol")

    citations.forEach((citation, index) => {
        const item = document.createElement("li")
        const link = document.createElement("a")
        link.href = citation.uri
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        link.textContent = `[${index + 1}] ${citation.title}`
        item.appendChild(link)
        list.appendChild(item)
    })

    section.appendChild(label)
    section.appendChild(list)
    return section
}

function getStoredFeedback() {
    try {
        const stored = localStorage.getItem(FEEDBACK_STORAGE_KEY)
        return stored ? JSON.parse(stored) : {}
    } catch {
        return {}
    }
}

function getFeedbackVote(messageId) {
    const entry = getStoredFeedback()[messageId]
    if (!entry) return null
    return typeof entry === "string" ? entry : entry.vote
}

function getFeedbackComment(messageId) {
    try {
        const stored = localStorage.getItem(FEEDBACK_COMMENTS_KEY)
        const comments = stored ? JSON.parse(stored) : {}
        return comments[messageId] || ""
    } catch {
        return ""
    }
}

function saveFeedbackComment(messageId, comment) {
    try {
        const stored = localStorage.getItem(FEEDBACK_COMMENTS_KEY)
        const comments = stored ? JSON.parse(stored) : {}
        if (comment.trim()) {
            comments[messageId] = comment.trim()
        } else {
            delete comments[messageId]
        }
        localStorage.setItem(FEEDBACK_COMMENTS_KEY, JSON.stringify(comments))
    } catch {
        /* ignore storage errors */
    }
}

function saveFeedback(messageId, vote) {
    const stored = getStoredFeedback()
    stored[messageId] = vote
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(stored))
}

function removeFeedback(messageId) {
    const stored = getStoredFeedback()
    delete stored[messageId]
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(stored))
    saveFeedbackComment(messageId, "")
}

function updateFeedbackUI(feedbackWrap, vote) {
    const feedbackBar = feedbackWrap.querySelector(".bot-feedback")
    feedbackBar.classList.toggle("has-vote", vote !== null)

    feedbackBar.querySelectorAll(".feedback-btn").forEach((btn) => {
        const isActive = vote !== null && btn.dataset.vote === vote
        btn.classList.toggle("active", isActive)
        btn.setAttribute("aria-pressed", isActive ? "true" : "false")
    })
}

function clearFollowupTimer(feedbackWrap) {
    if (feedbackWrap._followupTimer) {
        clearTimeout(feedbackWrap._followupTimer)
        feedbackWrap._followupTimer = null
    }
}

function hideFollowup(feedbackWrap) {
    clearFollowupTimer(feedbackWrap)
    const followup = feedbackWrap.querySelector(".feedback-followup")
    if (!followup) return
    followup.hidden = true
    followup.innerHTML = ""
}

function autoHideFollowup(feedbackWrap, delay = 3000) {
    clearFollowupTimer(feedbackWrap)
    feedbackWrap._followupTimer = setTimeout(() => hideFollowup(feedbackWrap), delay)
}

function autoHideElement(element, delay = 3000) {
    setTimeout(() => {
        element.classList.add("feedback-fade-out")
        setTimeout(() => element.remove(), 300)
    }, delay)
}

function showFeedbackFollowup(feedbackWrap, messageId, vote, isNewVote = false) {
    const followup = feedbackWrap.querySelector(".feedback-followup")
    const savedComment = getFeedbackComment(messageId)

    clearFollowupTimer(feedbackWrap)
    followup.innerHTML = ""
    followup.hidden = vote === null

    if (!isNewVote) return

    if (vote === "up") {
        followup.className = "feedback-followup feedback-followup-up"
        followup.innerHTML = "<p>Thanks for your feedback! Glad we could help.</p>"
        autoHideFollowup(feedbackWrap, 3000)
        return
    }

    if (vote === "down") {
        followup.className = "feedback-followup feedback-followup-down"

        const message = document.createElement("p")
        message.className = "feedback-sorry-msg"
        message.textContent =
            "Sorry this wasn't helpful. Try rephrasing your question or being more specific."

        const label = document.createElement("label")
        label.className = "feedback-comment-label"
        label.textContent = "What went wrong? (optional)"

        const textarea = document.createElement("textarea")
        textarea.className = "feedback-comment"
        textarea.placeholder = "Tell us how we can improve..."
        textarea.rows = 2
        textarea.value = savedComment

        const actions = document.createElement("div")
        actions.className = "feedback-comment-actions"

        const submitBtn = document.createElement("button")
        submitBtn.type = "button"
        submitBtn.className = "feedback-submit-btn"
        submitBtn.textContent = "Send feedback"

        const status = document.createElement("p")
        status.className = "feedback-comment-status"
        status.hidden = true

        autoHideElement(message, 3000)

        submitBtn.addEventListener("click", () => {
            saveFeedbackComment(messageId, textarea.value)
            label.hidden = true
            textarea.hidden = true
            actions.hidden = true
            status.textContent = "Thanks — your feedback was saved."
            status.hidden = false
            autoHideFollowup(feedbackWrap, 3000)
        })

        actions.appendChild(submitBtn)
        followup.append(message, label, textarea, actions, status)
    }
}

function handleFeedbackClick(messageId, feedbackWrap, vote) {
    const currentVote = getFeedbackVote(messageId) ?? null

    if (currentVote === vote) {
        removeFeedback(messageId)
        updateFeedbackUI(feedbackWrap, null)
        hideFollowup(feedbackWrap)
        return
    }

    saveFeedback(messageId, vote)
    updateFeedbackUI(feedbackWrap, vote)
    showFeedbackFollowup(feedbackWrap, messageId, vote, true)
}

function setupFeedback(botChatBox, messageId) {
    const wrap = botChatBox.querySelector(".bot-message-wrap")
    if (!wrap) return

    wrap.querySelector(".bot-feedback-wrap")?.remove()

    const feedbackWrap = document.createElement("div")
    feedbackWrap.className = "bot-feedback-wrap"

    const feedbackBar = document.createElement("div")
    feedbackBar.className = "bot-feedback"

    const label = document.createElement("span")
    label.className = "feedback-label"
    label.textContent = "Was this helpful?"

    const upBtn = document.createElement("button")
    upBtn.type = "button"
    upBtn.className = "feedback-btn"
    upBtn.dataset.vote = "up"
    upBtn.setAttribute("aria-label", "Thumbs up")
    upBtn.innerHTML = thumbUpSvg

    const downBtn = document.createElement("button")
    downBtn.type = "button"
    downBtn.className = "feedback-btn"
    downBtn.dataset.vote = "down"
    downBtn.setAttribute("aria-label", "Thumbs down")
    downBtn.innerHTML = thumbDownSvg

    feedbackBar.append(label, upBtn, downBtn)

    const followup = document.createElement("div")
    followup.className = "feedback-followup"
    followup.hidden = true

    upBtn.addEventListener("click", () => handleFeedbackClick(messageId, feedbackWrap, "up"))
    downBtn.addEventListener("click", () => handleFeedbackClick(messageId, feedbackWrap, "down"))

    feedbackWrap.append(feedbackBar, followup)
    wrap.appendChild(feedbackWrap)

    const savedVote = getFeedbackVote(messageId)
    updateFeedbackUI(feedbackWrap, savedVote)
}

function renderBotMessage(botChatBox, responseText, citations, messageId) {
    const chatArea = botChatBox.querySelector(".bot-chat-area")
    chatArea.innerHTML = ""

    chatArea.appendChild(renderMessageText(responseText, citations))

    const citationsEl = renderCitations(citations)
    if (citationsEl) {
        chatArea.appendChild(citationsEl)
    }

    setupFeedback(botChatBox, messageId)
}

const CITATION_INSTRUCTION =
    "For factual or informational questions, always cite sources.\n" +
    "1. Use inline markers like [1], [2] in the answer where relevant.\n" +
    "2. End with a Sources section formatted exactly like:\n\n" +
    "Sources:\n" +
    "1. Source title - https://en.wikipedia.org/wiki/Example\n" +
    "2. Another source - https://www.britannica.com/science/example\n\n" +
    "IMPORTANT: Use only direct public https URLs to real pages. Never use vertexaisearch.cloud.google.com links or made-up URLs. For simple greetings or casual chat, skip citations."

async function callGemini(useSearch) {
    const body = {
        contents: chatHistory,
        systemInstruction: {
            parts: [{ text: CITATION_INSTRUCTION }]
        }
    }

    if (useSearch) {
        body.tools = [{ google_search: {} }]
    }

    const response = await fetch(Api_Url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok || data.error) {
        throw new Error(data.error?.message || "Failed to get a response. Please try again.")
    }

    return data
}

async function generateResponse(botChatBox) {
    const chatArea = botChatBox.querySelector(".bot-chat-area")
    const messageId = botChatBox.dataset.messageId

    try {
        let data

        try {
            data = await callGemini(true)
        } catch {
            data = await callGemini(false)
        }

        const candidate = data.candidates?.[0]
        const apiResponse = candidate?.content?.parts?.[0]?.text

        if (!apiResponse) {
            throw new Error("No valid response received. Please try again.")
        }

        const groundingCitations = extractCitations(candidate)
        const { message, citations } = splitMessageAndCitations(apiResponse, groundingCitations)

        renderBotMessage(botChatBox, message, citations, messageId)

        chatHistory.push({
            role: "model",
            parts: [{ text: message }]
        })
    } catch (error) {
        console.error(error)
        chatHistory.pop()
        chatArea.innerHTML = `<div class="bot-message-text bot-error">Sorry, something went wrong: ${escapeHtml(error.message)}</div>`
    } finally {
        isLoading = false
        submitbtn.disabled = false
        prompt.disabled = false
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" })
        clearPendingImage()
    }
}

function createChatBox(html, classes) {
    const div = document.createElement("div")
    div.innerHTML = html
    div.classList.add(classes)
    return div
}

function clearPendingImage() {
    pendingImage = { mime_type: null, data: null }
    image.src = "img.svg"
    image.classList.remove("choose")
    imageinput.value = ""
}

function handlechatResponse(userMessage) {
    if (isLoading) return

    const message = userMessage.trim()
    const imageData = pendingImage.data
        ? { mime_type: pendingImage.mime_type, data: pendingImage.data }
        : null

    if (!message && !imageData) return

    isLoading = true
    submitbtn.disabled = true
    prompt.disabled = true

    const userParts = buildUserParts(message, imageData)

    chatHistory.push({
        role: "user",
        parts: userParts
    })

    const imagePreview = imageData
        ? `<img src="data:${imageData.mime_type};base64,${imageData.data}" class="chooseimg" alt="Uploaded image" />`
        : ""

    const displayMessage = message || (imageData ? "📷 Image sent" : "")

    const userHtml = `<img src="images/user.png" alt="" id="userImage" width="8%">
        <div class="user-chat-area">
            ${displayMessage}
            ${imagePreview}
        </div>`

    prompt.value = ""
    clearPendingImage()

    const userChatBox = createChatBox(userHtml, "user-chat-box")
    chatContainer.appendChild(userChatBox)
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" })

    setTimeout(() => {
        const messageId = createMessageId()

        const botHtml = `<img src="images/chatbot.png" alt="" id="botImage" width="8%">
            <div class="bot-message-wrap">
                <div class="bot-chat-area">
                    <img src="images/loading.webp" alt="" class="load" width="50px">
                </div>
            </div>`

        const botChatBox = createChatBox(botHtml, "bot-chat-box")
        botChatBox.dataset.messageId = messageId
        chatContainer.appendChild(botChatBox)
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" })
        generateResponse(botChatBox)
    }, 300)
}

prompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handlechatResponse(prompt.value)
    }
})

submitbtn.addEventListener("click", () => {
    handlechatResponse(prompt.value)
})

imageinput.addEventListener("change", () => {
    const file = imageinput.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
        const base64string = e.target.result.split(",")[1]
        pendingImage = {
            mime_type: file.type,
            data: base64string
        }
        image.src = `data:${pendingImage.mime_type};base64,${pendingImage.data}`
        image.classList.add("choose")
    }

    reader.readAsDataURL(file)
})

imagebtn.addEventListener("click", () => {
    imagebtn.querySelector("input").click()
})