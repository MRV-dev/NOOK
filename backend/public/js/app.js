const authScreen = document.getElementById("auth-screen");
const chatApp = document.getElementById("chat-app");
const authForm = document.getElementById("auth-form");
const authNotice = document.getElementById("auth-notice");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authSubmit = document.getElementById("auth-submit");
const usernameField = document.getElementById("username-field");
const authSwitchCopy = document.getElementById("auth-switch-copy");
const authSwitch = document.getElementById("auth-switch");
const conversationList = document.getElementById("conversation-list");
const searchInput = document.getElementById("user-search");
const searchResults = document.getElementById("search-results");
const groupDialog = document.getElementById("group-dialog");
const groupForm = document.getElementById("group-form");
const groupNameInput = document.getElementById("group-name");
const groupSearchInput = document.getElementById("group-search");
const groupSelected = document.getElementById("group-selected");
const groupResults = document.getElementById("group-results");
const groupHint = document.getElementById("group-hint");
const groupNotice = document.getElementById("group-notice");
const groupSubmitButton = document.getElementById("group-submit-button");
const messages = document.getElementById("messages");
const messageToast = document.getElementById("message-toast");
const messageToastSender = document.getElementById("message-toast-sender");
const messageToastContent = document.getElementById("message-toast-content");
const errorToast = document.getElementById("error-toast");
let isRegistering = false;
let token = sessionStorage.getItem("chat-token");
let currentUser = null;
let currentConversation = null;
let socket = null;
let onlineUsers = new Set();
let searchTimeout = null;
let groupSearchTimeout = null;
let groupSearchMatches = [];
const selectedGroupMembers = new Map();
let messageToastTimeout = null;
let notificationConversationId = null;
let typingTimeout = null;
let isTyping = false;

const initials = (name = "?") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
const showError = (message) => {
  errorToast.textContent = message;
  errorToast.classList.remove("hidden");
  clearTimeout(showError.timeout);
  showError.timeout = setTimeout(
    () => errorToast.classList.add("hidden"),
    3500,
  );
};
const api = async (url, options = {}) => {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.message || `Request failed (${response.status})`);
  return data;
};
const showChat = () => {
  authScreen.classList.add("hidden");
  chatApp.classList.remove("hidden");
  document.getElementById("my-name").textContent = currentUser.username;
  document.getElementById("footer-name").textContent = currentUser.username;
  document.getElementById("my-avatar").textContent = initials(
    currentUser.username,
  );
  connectSocket();
  loadConversations();
};
const setAuthMode = (registering) => {
  isRegistering = registering;
  usernameField.classList.toggle("hidden", !registering);
  usernameField.querySelector("input").required = registering;
  authTitle.textContent = registering ? "Create your account" : "Welcome back";
  authSubtitle.textContent = registering
    ? "A name and email are all you need to get started."
    : "Sign in to pick up where you left off.";
  authSubmit.textContent = registering ? "Create account" : "Sign in";
  authSwitchCopy.textContent = registering
    ? "Already have an account?"
    : "New here?";
  authSwitch.textContent = registering ? "Sign in" : "Create an account";
  authForm.elements.password.autocomplete = registering
    ? "new-password"
    : "current-password";
  authNotice.textContent = "";
};

authSwitch.addEventListener("click", () => setAuthMode(!isRegistering));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authNotice.textContent = "";
  authSubmit.disabled = true;
  const form = new FormData(authForm);
  const body = { email: form.get("email"), password: form.get("password") };
  if (isRegistering) body.username = form.get("username");
  try {
    const result = await api(
      `/api/users/${isRegistering ? "register" : "login"}`,
      { method: "POST", body: JSON.stringify(body) },
    );
    token = result.token;
    currentUser = result.user;
    sessionStorage.setItem("chat-token", token);
    showChat();
  } catch (error) {
    authNotice.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

const setConversationHeader = (conversation) => {
  const otherParticipants = conversation.participants.filter(
    (person) => person._id !== currentUser.id,
  );
  const displayName =
    conversation.type === "group"
      ? conversation.name
      : otherParticipants[0]?.username || "Conversation";
  const otherId = otherParticipants[0]?._id;
  document.getElementById("chat-title").textContent = displayName;
  document.getElementById("chat-avatar").textContent = initials(displayName);
  document
    .getElementById("chat-avatar")
    .classList.toggle(
      "online",
      conversation.type === "direct" && Boolean(otherId && onlineUsers.has(otherId)),
    );
  document.getElementById("chat-status").textContent =
    conversation.type === "group"
      ? `${conversation.participants.length} participants`
      : otherId && onlineUsers.has(otherId)
        ? "Online"
        : "Direct conversation";
};
const renderConversation = (conversation) => {
  const other = conversation.participants.find(
    (person) => person._id !== currentUser.id,
  );
  const name =
    conversation.type === "group"
      ? conversation.name
      : other?.username || "Conversation";
  const item = document.createElement("button");
  item.type = "button";
  item.className = `conversation-item${currentConversation?._id === conversation._id ? " active" : ""}`;
  const avatar = document.createElement("span");
  avatar.className = `avatar small${conversation.type === "direct" && other && onlineUsers.has(other._id) ? " online" : ""}`;
  avatar.textContent = initials(name);
  const copy = document.createElement("span");
  copy.className = "conversation-copy";
  const top = document.createElement("span");
  top.className = "conversation-top";
  const title = document.createElement("strong");
  title.textContent = name;
  const time = document.createElement("time");
  time.textContent = conversation.lastMessage
    ? new Date(conversation.lastMessage.createdAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const preview = document.createElement("p");
  preview.textContent =
    conversation.lastMessage?.content || "Start a conversation";
  top.append(title, time);
  copy.append(top, preview);
  item.append(avatar, copy);
  item.addEventListener("click", () => openConversation(conversation));
  return item;
};
const loadConversations = async () => {
  try {
    const conversations = await api("/api/conversations");
    conversationList.replaceChildren(...conversations.map(renderConversation));
    document.getElementById("conversation-count").textContent =
      conversations.length ? String(conversations.length) : "";
  } catch (error) {
    showError(error.message);
  }
};
const showMessageNotification = ({ conversationId, sender, content }) => {
  if (currentConversation?._id === conversationId) return;

  notificationConversationId = conversationId;
  messageToastSender.textContent = sender?.username || "New message";
  messageToastContent.textContent = content;
  messageToast.classList.remove("hidden");
  clearTimeout(messageToastTimeout);
  messageToastTimeout = setTimeout(
    () => messageToast.classList.add("hidden"),
    5500,
  );
  loadConversations();
};
const appendMessage = (message) => {
  const sender = message.sender;
  const senderId = typeof sender === "object" ? sender?._id : sender;
  const row = document.createElement("div");
  row.className = `message-row${senderId === currentUser.id ? " mine" : ""}`;
  if (senderId !== currentUser.id) {
    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = sender?.username || "Member";
    row.append(meta);
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.content;
  const time = document.createElement("div");
  time.className = "message-meta";
  time.textContent = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  row.append(bubble, time);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
};
const loadMessages = async (conversationId) => {
  try {
    const history = await api(
      `/api/conversations/${conversationId}/messages?limit=100`,
    );
    if (currentConversation?._id !== conversationId) return;
    messages.replaceChildren();
    history.forEach(appendMessage);
  } catch (error) {
    showError(error.message);
  }
};
const openConversation = (conversation) => {
  if (isTyping && currentConversation && socket) {
    socket.emit("typing:set", {
      conversationId: currentConversation._id,
      isTyping: false,
    });
    isTyping = false;
  }
  currentConversation = conversation;
  chatApp.classList.add("chat-open");
  document.getElementById("welcome-state").classList.add("hidden");
  document.getElementById("chat-header").classList.remove("hidden");
  document.getElementById("composer-wrap").classList.remove("hidden");
  messages.classList.remove("hidden");
  document.getElementById("typing-indicator").textContent = "";
  setConversationHeader(conversation);
  loadConversations();
  socket?.emit(
    "conversation:join",
    { conversationId: conversation._id },
    (result) => {
      if (!result?.ok)
        showError(result?.message || "Could not join conversation");
      else loadMessages(conversation._id);
    },
  );
};

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  const query = searchInput.value.trim();
  if (query.length < 2) {
    searchResults.classList.add("hidden");
    return;
  }
  searchTimeout = setTimeout(async () => {
    try {
      const users = await api(
        `/api/users/search?q=${encodeURIComponent(query)}`,
      );
      searchResults.replaceChildren();
      if (!users.length) {
        const empty = document.createElement("div");
        empty.className = "search-result";
        empty.textContent = "No people found";
        searchResults.append(empty);
      }
      users.forEach((person) => {
        const result = document.createElement("button");
        result.type = "button";
        result.className = "search-result";
        const avatar = document.createElement("span");
        avatar.className = `avatar small${onlineUsers.has(person._id) ? " online" : ""}`;
        avatar.textContent = initials(person.username);
        const name = document.createElement("strong");
        name.textContent = person.username;
        result.append(avatar, name);
        result.addEventListener("click", async () => {
          try {
            const conversation = await api("/api/conversations", {
              method: "POST",
              body: JSON.stringify({
                type: "direct",
                participants: [person._id],
              }),
            });
            searchResults.classList.add("hidden");
            searchInput.value = "";
            await loadConversations();
            openConversation(conversation);
          } catch (error) {
            showError(error.message);
          }
        });
        searchResults.append(result);
      });
      searchResults.classList.remove("hidden");
    } catch (error) {
      showError(error.message);
    }
  }, 220);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-wrap"))
    searchResults.classList.add("hidden");
});

const updateGroupSelection = () => {
  groupSelected.replaceChildren();
  selectedGroupMembers.forEach((person) => {
    const member = document.createElement("span");
    member.className = "group-selected-person";
    const name = document.createElement("span");
    name.textContent = person.username;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${person.username}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="m18 6-12 12M6 6l12 12"></path></svg>';
    remove.addEventListener("click", () => {
      selectedGroupMembers.delete(person._id);
      updateGroupSelection();
      renderGroupSearchResults();
    });
    member.append(name, remove);
    groupSelected.append(member);
  });

  groupHint.textContent = `${selectedGroupMembers.size} selected. Choose at least two people to start a group.`;
  groupSubmitButton.disabled = selectedGroupMembers.size < 2;
};

const renderGroupSearchResults = () => {
  groupResults.replaceChildren();
  if (!groupSearchMatches.length) {
    const empty = document.createElement("p");
    empty.className = "group-empty";
    empty.textContent = groupSearchInput.value.trim().length >= 2
      ? "No people found"
      : "Search by name or email to add people";
    groupResults.append(empty);
    return;
  }

  groupSearchMatches.forEach((person) => {
    const selected = selectedGroupMembers.has(person._id);
    const result = document.createElement("button");
    result.type = "button";
    result.className = `search-result group-member${selected ? " selected" : ""}`;
    result.setAttribute("aria-pressed", String(selected));
    const avatar = document.createElement("span");
    avatar.className = `avatar small${onlineUsers.has(person._id) ? " online" : ""}`;
    avatar.textContent = initials(person.username);
    const name = document.createElement("strong");
    name.textContent = person.username;
    const state = document.createElement("span");
    state.className = "group-member-state";
    state.textContent = selected ? "Added" : "Add";
    result.append(avatar, name, state);
    result.addEventListener("click", () => {
      if (selectedGroupMembers.has(person._id))
        selectedGroupMembers.delete(person._id);
      else selectedGroupMembers.set(person._id, person);
      updateGroupSelection();
      renderGroupSearchResults();
    });
    groupResults.append(result);
  });
};

const resetGroupDialog = () => {
  clearTimeout(groupSearchTimeout);
  groupForm.reset();
  selectedGroupMembers.clear();
  groupSearchMatches = [];
  groupResults.replaceChildren();
  groupNotice.textContent = "";
  updateGroupSelection();
};

document.getElementById("create-group-button").addEventListener("click", () => {
  resetGroupDialog();
  groupDialog.showModal();
  groupNameInput.focus();
});
document.getElementById("group-close-button").addEventListener("click", () => groupDialog.close());
document.getElementById("group-cancel-button").addEventListener("click", () => groupDialog.close());
groupDialog.addEventListener("click", (event) => {
  if (event.target === groupDialog) groupDialog.close();
});
groupSearchInput.addEventListener("input", () => {
  clearTimeout(groupSearchTimeout);
  const query = groupSearchInput.value.trim();
  if (query.length < 2) {
    groupSearchMatches = [];
    renderGroupSearchResults();
    return;
  }

  groupSearchTimeout = setTimeout(async () => {
    try {
      groupSearchMatches = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
      renderGroupSearchResults();
    } catch (error) {
      groupNotice.textContent = error.message;
    }
  }, 220);
});
groupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  groupNotice.textContent = "";
  groupSubmitButton.disabled = true;
  groupSubmitButton.textContent = "Creating...";
  try {
    const conversation = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        type: "group",
        name: groupNameInput.value.trim(),
        participants: [...selectedGroupMembers.keys()],
      }),
    });
    groupDialog.close();
    resetGroupDialog();
    await loadConversations();
    openConversation(conversation);
  } catch (error) {
    groupNotice.textContent = error.message;
  } finally {
    groupSubmitButton.textContent = "Create group";
    groupSubmitButton.disabled = selectedGroupMembers.size < 2;
  }
});

document.getElementById("message-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("message-input");
  const content = input.value.trim();
  if (!content || !currentConversation || !socket?.connected) return;
  socket.emit(
    "message:send",
    { conversationId: currentConversation._id, content },
    (result) => {
      if (!result?.ok)
        return showError(result?.message || "Could not send message");
      appendMessage(result.message);
      input.value = "";
      loadConversations();
    },
  );
  if (isTyping) {
    socket.emit("typing:set", {
      conversationId: currentConversation._id,
      isTyping: false,
    });
    isTyping = false;
  }
});
document.getElementById("message-input").addEventListener("input", () => {
  if (!currentConversation || !socket?.connected) return;
  if (!isTyping) {
    socket.emit("typing:set", {
      conversationId: currentConversation._id,
      isTyping: true,
    });
    isTyping = true;
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (isTyping && currentConversation)
      socket.emit("typing:set", {
        conversationId: currentConversation._id,
        isTyping: false,
      });
    isTyping = false;
  }, 900);
});

const connectSocket = () => {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  socket.on("connect_error", (error) => showError(error.message));
  socket.on("presence:list", (ids) => {
    onlineUsers = new Set(ids);
    loadConversations();
  });
  socket.on("presence:online", ({ userId }) => {
    onlineUsers.add(userId);
    loadConversations();
    if (currentConversation) setConversationHeader(currentConversation);
  });
  socket.on("presence:offline", ({ userId }) => {
    onlineUsers.delete(userId);
    loadConversations();
    if (currentConversation) setConversationHeader(currentConversation);
  });
  socket.on("message:new", (message) => {
    if (currentConversation?._id === message.conversation)
      appendMessage(message);
    loadConversations();
  });
  socket.on("message:notification", showMessageNotification);
  socket.on("typing:update", ({ conversationId, user, isTyping: typing }) => {
    if (currentConversation?._id === conversationId)
      document.getElementById("typing-indicator").textContent = typing
        ? `${user.username} is typing...`
        : "";
  });
};

document
  .getElementById("back-button")
  .addEventListener("click", () => chatApp.classList.remove("chat-open"));
messageToast.addEventListener("click", async () => {
  clearTimeout(messageToastTimeout);
  messageToast.classList.add("hidden");
  try {
    const conversations = await api("/api/conversations");
    const conversation = conversations.find(
      (item) => item._id === notificationConversationId,
    );
    if (conversation) openConversation(conversation);
  } catch (error) {
    showError(error.message);
  }
});
document.getElementById("logout").addEventListener("click", () => {
  socket?.disconnect();
  clearTimeout(messageToastTimeout);
  messageToast.classList.add("hidden");
  sessionStorage.removeItem("chat-token");
  token = null;
  currentUser = null;
  currentConversation = null;
  onlineUsers.clear();
  chatApp.classList.add("hidden");
  chatApp.classList.remove("chat-open");
  authScreen.classList.remove("hidden");
  authForm.reset();
  setAuthMode(false);
});

if (token) {
  api("/api/users/me")
    .then((user) => {
      currentUser = user;
      showChat();
    })
    .catch(() => {
      sessionStorage.removeItem("chat-token");
      token = null;
    });
}
