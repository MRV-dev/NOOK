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
const addMembersDialog = document.getElementById("add-members-dialog");
const addMembersForm = document.getElementById("add-members-form");
const addMembersSearch = document.getElementById("add-members-search");
const addMembersSelected = document.getElementById("add-members-selected");
const addMembersResults = document.getElementById("add-members-results");
const addMembersHint = document.getElementById("add-members-hint");
const addMembersNotice = document.getElementById("add-members-notice");
const addMembersSubmit = document.getElementById("add-members-submit");
const groupDetailsDialog = document.getElementById("group-details-dialog");
const groupDetailsForm = document.getElementById("group-details-form");
const groupDetailsName = document.getElementById("group-details-name");
const groupDetailsParticipants = document.getElementById(
  "group-details-participants",
);
const groupDetailsNotice = document.getElementById("group-details-notice");
const groupDetailsSave = document.getElementById("group-details-save");
const messages = document.getElementById("messages");
const mediaViewer = document.getElementById("media-viewer");
const mediaViewerBackground = document.getElementById("media-viewer-background");
const mediaViewerContent = document.getElementById("media-viewer-content");
const mediaViewerClose = document.getElementById("media-viewer-close");
const mediaViewerDownload = document.getElementById("media-viewer-download");
const mediaViewerShare = document.getElementById("media-viewer-share");
const mediaViewerPrevious = document.getElementById("media-viewer-previous");
const mediaViewerNext = document.getElementById("media-viewer-next");
const mediaViewerCounter = document.getElementById("media-viewer-counter");
const mediaViewerThumbnails = document.getElementById("media-viewer-thumbnails");
const messageInput = document.getElementById("message-input");
const mediaInput = document.getElementById("media-input");
const attachMediaButton = document.getElementById("attach-media");
const mediaPreview = document.getElementById("media-preview");
const messageSendButton = document.querySelector("#message-form .primary");
const messageToast = document.getElementById("message-toast");
const messageToastSender = document.getElementById("message-toast-sender");
const messageToastContent = document.getElementById("message-toast-content");
const errorToast = document.getElementById("error-toast");
const appearanceMenu = document.getElementById("appearance-menu");
const appearanceOptions = document.querySelectorAll('input[name="appearance"]');
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
const themeStorageKey = "real-time-chat-theme";
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
let addMemberSearchTimeout = null;
let addMemberSearchMatches = [];
const selectedMembersToAdd = new Map();
let messageToastTimeout = null;
let notificationConversationId = null;
let typingTimeout = null;
let isTyping = false;
let themePreference = "system";
const selectedMediaFiles = [];
const maxMediaFiles = 8;
const maxMediaFileSize = 25 * 1024 * 1024;
let mediaViewerItems = [];
let mediaViewerIndex = -1;

try {
  const savedThemePreference = localStorage.getItem(themeStorageKey);
  if (["system", "light", "dark"].includes(savedThemePreference)) {
    themePreference = savedThemePreference;
  }
} catch {}

const applyThemePreference = () => {
  const useDarkTheme =
    themePreference === "dark" ||
    (themePreference === "system" && systemColorScheme.matches);
  document.documentElement.dataset.theme = useDarkTheme ? "dark" : "light";
  appearanceOptions.forEach((option) => {
    option.checked = option.value === themePreference;
  });
};

appearanceOptions.forEach((option) => {
  option.addEventListener("change", () => {
    if (!option.checked) return;
    themePreference = option.value;
    try {
      localStorage.setItem(themeStorageKey, themePreference);
    } catch {}
    applyThemePreference();
  });
});
systemColorScheme.addEventListener("change", () => {
  if (themePreference === "system") applyThemePreference();
});
document.addEventListener("click", (event) => {
  if (!appearanceMenu.contains(event.target)) appearanceMenu.open = false;
});
applyThemePreference();

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
    ...(options.body && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
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
  document.documentElement.classList.add("chat-active");
  document.body.classList.add("chat-active");
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
  document
    .getElementById("add-group-members-button")
    .classList.toggle("hidden", conversation.type !== "group");
  document
    .getElementById("group-details-button")
    .classList.toggle("hidden", conversation.type !== "group");
};
const renderConversation = (conversation) => {
  const other = conversation.participants.find(
    (person) => person._id !== currentUser.id,
  );
  const name =
    conversation.type === "group"
      ? conversation.name
      : other?.username || "Conversation";
  const entry = document.createElement("div");
  entry.className = "conversation-entry";
  const item = document.createElement("button");
  item.type = "button";
  item.className = `conversation-item${currentConversation?._id === conversation._id ? " active" : ""}`;
  item.dataset.conversationId = conversation._id;
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
  const actions = document.createElement("details");
  actions.className = "conversation-actions";
  const trigger = document.createElement("summary");
  trigger.textContent = "⋮";
  trigger.setAttribute("aria-label", "Conversation options");
  trigger.title = "Conversation options";
  const menu = document.createElement("div");
  menu.className = "conversation-menu";
  const hideButton = document.createElement("button");
  hideButton.className = "conversation-hide";
  hideButton.type = "button";
  hideButton.textContent = "Delete chat";
  menu.append(hideButton);
  actions.append(trigger, menu);
  entry.append(item, actions);
  return entry;
};
const loadConversations = async () => {
  try {
    const conversations = await api("/api/conversations");
    conversationList.replaceChildren(...conversations.map(renderConversation));
    document.getElementById("conversation-count").textContent =
      conversations.length ? String(conversations.length) : "";
    return conversations;
  } catch (error) {
    showError(error.message);
    return [];
  }
};
conversationList.addEventListener("click", async (event) => {
  const hideButton = event.target.closest(".conversation-hide");
  if (!hideButton) return;

  const conversationId = hideButton
    .closest(".conversation-entry")
    ?.querySelector(".conversation-item")?.dataset.conversationId;
  if (!conversationId) return;

  hideButton.disabled = true;
  try {
    await api(`/api/conversations/${conversationId}`, { method: "DELETE" });
  } catch (error) {
    showError(error.message);
    hideButton.disabled = false;
  }
});
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
const resizeMessageInput = () => {
  messageInput.style.height = "44px";
  const configuredMaxHeight = Number.parseFloat(
    getComputedStyle(messageInput).maxHeight,
  );
  const maxHeight = Number.isFinite(configuredMaxHeight)
    ? configuredMaxHeight
    : 160;
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, maxHeight)}px`;
  messageInput.style.overflowY =
    messageInput.scrollHeight > maxHeight ? "auto" : "hidden";
};
const renderMediaPreview = () => {
  const previews = selectedMediaFiles.map(({ file, previewUrl }, index) => {
    const item = document.createElement("div");
    item.className = "media-preview-item";
    item.title = file.name;

    const preview = document.createElement(file.type.startsWith("video/") ? "video" : "img");
    preview.className = "media-preview-thumb";
    preview.src = previewUrl;
    if (preview instanceof HTMLVideoElement) {
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = "metadata";
    } else {
      preview.alt = file.name;
    }

    const remove = document.createElement("button");
    remove.className = "media-preview-remove";
    remove.type = "button";
    remove.dataset.previewIndex = String(index);
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    item.append(preview, remove);
    return item;
  });

  mediaPreview.replaceChildren(...previews);
  mediaPreview.classList.toggle("hidden", previews.length === 0);
};
const clearSelectedMedia = () => {
  selectedMediaFiles.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
  selectedMediaFiles.length = 0;
  renderMediaPreview();
};
const appendMessage = (message) => {
  const sender = message.sender;
  const senderId = typeof sender === "object" ? sender?._id : sender;
  const mediaAttachments = Array.isArray(message.media) && message.media.length
    ? message.media
    : message.mediaUrl
      ? [{ url: message.mediaUrl, type: message.mediaType }]
      : [];
  const isPhotoStack =
    mediaAttachments.length > 1 &&
    mediaAttachments.every((attachment) => attachment.type === "image");
  const row = document.createElement("div");
  row.className = `message-row${senderId === currentUser.id ? " mine" : ""}`;
  row.dataset.messageId = message._id;
  if (senderId !== currentUser.id) {
    const meta = document.createElement("div");
    meta.className = `message-meta${isPhotoStack ? " media-stack-label" : ""}`;
    meta.textContent = isPhotoStack
      ? `${sender?.username || "Member"} sent ${mediaAttachments.length} photos`
      : sender?.username || "Member";
    row.append(meta);
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (mediaAttachments.length && !message.isDeleted) {
    bubble.classList.add("media-bubble");
    const gallery = document.createElement("div");
    gallery.className = isPhotoStack
      ? "message-media-stack"
      : `message-media-grid${mediaAttachments.length === 1 ? " single" : ""}`;
    mediaAttachments.forEach((attachment, index) => {
      const mediaItem = document.createElement("div");
      mediaItem.className = `message-media-item${isPhotoStack ? " message-media-stack-item" : ""}`;
      mediaItem.dataset.stackIndex = String(index);
      if (isPhotoStack && index >= 3) mediaItem.hidden = true;
      const media = document.createElement(attachment.type === "video" ? "video" : "img");
      media.className = "message-media";
      media.src = attachment.url;
      media.dataset.mediaUrl = attachment.url;
      media.dataset.mediaType = attachment.type;
      media.dataset.mediaIndex = String(index);
      if (attachment.type === "video") {
        media.controls = true;
        media.playsInline = true;
        media.preload = "metadata";
        const openButton = document.createElement("button");
        openButton.className = "media-open";
        openButton.type = "button";
        openButton.dataset.mediaUrl = attachment.url;
        openButton.dataset.mediaType = "video";
        openButton.dataset.messageId = message._id;
        openButton.dataset.mediaIndex = String(index);
        openButton.setAttribute("aria-label", "Open video large");
        openButton.title = "Open video large";
        const expandIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        expandIcon.setAttribute("viewBox", "0 0 24 24");
        expandIcon.setAttribute("aria-hidden", "true");
        const expandPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        expandPath.setAttribute("d", "M15 3h6v6m-7 1 7-7M9 21H3v-6m7-1-7 7");
        expandIcon.append(expandPath);
        openButton.append(expandIcon);
        mediaItem.append(media, openButton);
      } else {
        media.alt = message.content || `Shared image ${index + 1}`;
        media.loading = "lazy";
        mediaItem.append(media);
      }

      if (
        attachment.type === "image" &&
        senderId !== currentUser.id &&
        (!isPhotoStack || index === Math.min(2, mediaAttachments.length - 1))
      ) {
        const downloadButton = document.createElement("button");
        downloadButton.className = "media-download";
        downloadButton.type = "button";
        downloadButton.dataset.mediaIndex = String(index);
        downloadButton.setAttribute("aria-label", "Download image");
        downloadButton.title = "Download image";
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("aria-hidden", "true");
        const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        iconPath.setAttribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3");
        icon.append(iconPath);
        downloadButton.append(icon);
        mediaItem.append(downloadButton);
      }

      gallery.append(mediaItem);
    });
    bubble.append(gallery);
    if (message.content) {
      const caption = document.createElement("span");
      caption.className = "media-caption";
      caption.textContent = message.content;
      bubble.append(caption);
    }
  } else {
    bubble.textContent = message.content;
  }
  if (message.isDeleted) bubble.classList.add("deleted");
  const content = document.createElement("div");
  content.className = "message-content";
  if (senderId === currentUser.id && !message.isDeleted) {
    const actions = document.createElement("details");
    actions.className = "message-actions";
    const trigger = document.createElement("summary");
    trigger.textContent = "⋮";
    trigger.setAttribute("aria-label", "Message options");
    trigger.title = "Message options";
    const menu = document.createElement("div");
    menu.className = "message-menu";
    const deleteButton = document.createElement("button");
    deleteButton.className = "message-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete message";
    menu.append(deleteButton);
    actions.append(trigger, menu);
    content.append(actions);
  }
  content.append(bubble);
  const time = document.createElement("div");
  time.className = "message-meta";
  time.textContent = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  row.append(content, time);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
};
const showMessageDeleted = ({ messageId }) => {
  const row = [...messages.querySelectorAll(".message-row")].find(
    (messageRow) => messageRow.dataset.messageId === messageId,
  );
  if (!row) return;

  const bubble = row.querySelector(".bubble");
  bubble.textContent = "Message deleted";
  bubble.classList.add("deleted");
  row.querySelector(".message-actions")?.remove();
};
const loadMessages = async (conversationId) => {
  try {
    const history = await api(
      `/api/conversations/${conversationId}/messages?limit=100`,
    );
    if (currentConversation?._id !== conversationId) return;
    messages.replaceChildren();
    history.forEach(appendMessage);
    socket?.emit("conversation:read", { conversationId });
  } catch (error) {
    showError(error.message);
  }
};
const openConversation = (conversation) => {
  if (
    currentConversation?._id !== conversation._id &&
    selectedMediaFiles.length
  ) {
    clearSelectedMedia();
  }
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

const updateAddMembersSelection = () => {
  addMembersSelected.replaceChildren();
  selectedMembersToAdd.forEach((person) => {
    const member = document.createElement("span");
    member.className = "group-selected-person";
    const name = document.createElement("span");
    name.textContent = person.username;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${person.username}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24"><path d="m18 6-12 12M6 6l12 12"></path></svg>';
    remove.addEventListener("click", () => {
      selectedMembersToAdd.delete(person._id);
      updateAddMembersSelection();
      renderAddMemberResults();
    });
    member.append(name, remove);
    addMembersSelected.append(member);
  });

  addMembersHint.textContent = selectedMembersToAdd.size
    ? `${selectedMembersToAdd.size} selected. Choose one or more people to add.`
    : "Choose one or more people to add.";
  addMembersSubmit.disabled = selectedMembersToAdd.size === 0;
};

const renderAddMemberResults = () => {
  addMembersResults.replaceChildren();
  const currentMemberIds = new Set(
    (currentConversation?.participants || []).map((person) => person._id),
  );
  const availablePeople = addMemberSearchMatches.filter(
    (person) => !currentMemberIds.has(person._id),
  );

  if (!availablePeople.length) {
    const empty = document.createElement("p");
    empty.className = "group-empty";
    empty.textContent = addMembersSearch.value.trim().length >= 2
      ? "No new people found"
      : "Search by name or email to add people";
    addMembersResults.append(empty);
    return;
  }

  availablePeople.forEach((person) => {
    const selected = selectedMembersToAdd.has(person._id);
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
    state.textContent = selected ? "Selected" : "Add";
    result.append(avatar, name, state);
    result.addEventListener("click", () => {
      if (selectedMembersToAdd.has(person._id))
        selectedMembersToAdd.delete(person._id);
      else selectedMembersToAdd.set(person._id, person);
      updateAddMembersSelection();
      renderAddMemberResults();
    });
    addMembersResults.append(result);
  });
};

const resetAddMembersDialog = () => {
  clearTimeout(addMemberSearchTimeout);
  addMembersForm.reset();
  addMemberSearchMatches = [];
  selectedMembersToAdd.clear();
  addMembersResults.replaceChildren();
  addMembersNotice.textContent = "";
  document.getElementById("add-members-group-name").textContent =
    currentConversation?.name || "Group chat";
  updateAddMembersSelection();
};

document
  .getElementById("add-group-members-button")
  .addEventListener("click", () => {
    resetAddMembersDialog();
    addMembersDialog.showModal();
    addMembersSearch.focus();
  });
document
  .getElementById("add-members-close")
  .addEventListener("click", () => addMembersDialog.close());
document
  .getElementById("add-members-cancel")
  .addEventListener("click", () => addMembersDialog.close());
addMembersDialog.addEventListener("click", (event) => {
  if (event.target === addMembersDialog) addMembersDialog.close();
});
addMembersSearch.addEventListener("input", () => {
  clearTimeout(addMemberSearchTimeout);
  const query = addMembersSearch.value.trim();
  if (query.length < 2) {
    addMemberSearchMatches = [];
    renderAddMemberResults();
    return;
  }

  addMemberSearchTimeout = setTimeout(async () => {
    try {
      addMemberSearchMatches = await api(
        `/api/users/search?q=${encodeURIComponent(query)}`,
      );
      renderAddMemberResults();
    } catch (error) {
      addMembersNotice.textContent = error.message;
    }
  }, 220);
});
addMembersForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentConversation) return;

  addMembersNotice.textContent = "";
  addMembersSubmit.disabled = true;
  addMembersSubmit.textContent = "Adding...";
  try {
    const updatedConversation = await api(
      `/api/conversations/${currentConversation._id}/participants`,
      {
        method: "POST",
        body: JSON.stringify({
          participants: [...selectedMembersToAdd.keys()],
        }),
      },
    );
    currentConversation = updatedConversation;
    setConversationHeader(updatedConversation);
    addMembersDialog.close();
    resetAddMembersDialog();
    await loadConversations();
  } catch (error) {
    addMembersNotice.textContent = error.message;
  } finally {
    addMembersSubmit.textContent = "Add to group";
    addMembersSubmit.disabled = selectedMembersToAdd.size === 0;
  }
});

const renderGroupDetails = () => {
  if (!currentConversation || currentConversation.type !== "group") return;

  groupDetailsName.value = currentConversation.name;
  document.getElementById("group-details-count").textContent =
    String(currentConversation.participants.length);
  const participantRows = currentConversation.participants.map((person) => {
    const row = document.createElement("div");
    row.className = "group-person-row";
    const avatar = document.createElement("span");
    avatar.className = `avatar${onlineUsers.has(person._id) ? " online" : ""}`;
    avatar.textContent = initials(person.username);
    const name = document.createElement("span");
    name.className = "group-person-name";
    name.textContent = person.username;
    const state = document.createElement("span");
    state.className = "group-person-state";
    state.textContent = person._id === currentUser.id
      ? "You"
      : onlineUsers.has(person._id)
        ? "Online"
        : "";
    row.append(avatar, name, state);
    return row;
  });
  groupDetailsParticipants.replaceChildren(...participantRows);
};

document.getElementById("group-details-button").addEventListener("click", () => {
  groupDetailsNotice.textContent = "";
  renderGroupDetails();
  groupDetailsDialog.showModal();
  groupDetailsName.focus();
});
document
  .getElementById("group-details-close")
  .addEventListener("click", () => groupDetailsDialog.close());
document
  .getElementById("group-details-cancel")
  .addEventListener("click", () => groupDetailsDialog.close());
groupDetailsDialog.addEventListener("click", (event) => {
  if (event.target === groupDetailsDialog) groupDetailsDialog.close();
});
groupDetailsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentConversation || currentConversation.type !== "group") return;

  groupDetailsNotice.textContent = "";
  groupDetailsSave.disabled = true;
  groupDetailsSave.textContent = "Saving...";
  try {
    const updatedConversation = await api(
      `/api/conversations/${currentConversation._id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name: groupDetailsName.value.trim() }),
      },
    );
    currentConversation = updatedConversation;
    setConversationHeader(updatedConversation);
    renderGroupDetails();
    await loadConversations();
  } catch (error) {
    groupDetailsNotice.textContent = error.message;
  } finally {
    groupDetailsSave.disabled = false;
    groupDetailsSave.textContent = "Save name";
  }
});

document.getElementById("message-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = messageInput.value.trim();
  if (!currentConversation) return;

  if (selectedMediaFiles.length) {
    const formData = new FormData();
    selectedMediaFiles.forEach(({ file }) => formData.append("media", file));
    if (content) formData.append("content", content);

    messageSendButton.disabled = true;
    attachMediaButton.disabled = true;
    try {
      await api(`/api/conversations/${currentConversation._id}/messages/media`, {
        method: "POST",
        body: formData,
      });
      clearSelectedMedia();
      messageInput.value = "";
      resizeMessageInput();
      loadConversations();
    } catch (error) {
      showError(error.message);
    } finally {
      messageSendButton.disabled = false;
      attachMediaButton.disabled = false;
    }
    return;
  }

  if (!content || !socket?.connected) return;
  socket.emit(
    "message:send",
    { conversationId: currentConversation._id, content },
    (result) => {
      if (!result?.ok)
        return showError(result?.message || "Could not send message");
      appendMessage(result.message);
      messageInput.value = "";
      resizeMessageInput();
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
attachMediaButton.addEventListener("click", () => mediaInput.click());
mediaInput.addEventListener("change", () => {
  const supportedTypes = new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
    "video/mp4", "video/webm", "video/quicktime",
  ]);

  for (const file of mediaInput.files || []) {
    if (!supportedTypes.has(file.type)) {
      showError(`${file.name} is not a supported image or video`);
      continue;
    }
    if (file.size > maxMediaFileSize) {
      showError(`${file.name} is larger than 25 MB`);
      continue;
    }
    if (selectedMediaFiles.length >= maxMediaFiles) {
      showError("You can attach up to 8 files per message");
      break;
    }
    selectedMediaFiles.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  mediaInput.value = "";
  renderMediaPreview();
});
mediaPreview.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".media-preview-remove");
  if (!removeButton) return;

  const index = Number(removeButton.dataset.previewIndex);
  const [removed] = selectedMediaFiles.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.previewUrl);
  renderMediaPreview();
});
messageInput.addEventListener("input", () => {
  resizeMessageInput();
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
messageInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  messageInput.form?.requestSubmit();
});
messages.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".message-delete");
  if (!deleteButton || !currentConversation || !socket?.connected) return;

  const row = deleteButton.closest(".message-row");
  socket.emit(
    "message:delete",
    {
      conversationId: currentConversation._id,
      messageId: row.dataset.messageId,
    },
    (result) => {
      if (!result?.ok) showError(result?.message || "Could not delete message");
    },
  );
  deleteButton.closest("details")?.removeAttribute("open");
});
const downloadConversationMedia = async ({ conversationId, messageId, mediaIndex }) => {
  const response = await fetch(
    `/api/conversations/${conversationId}/messages/${messageId}/media/${mediaIndex}/download`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Could not download media");
  }

  const mediaBlob = await response.blob();
  const objectUrl = URL.createObjectURL(mediaBlob);
  const link = document.createElement("a");
  const filename = response.headers
    .get("Content-Disposition")
    ?.match(/filename="([^"]+)"/)?.[1] || "shared-media";
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const collectConversationMedia = () =>
  [...messages.querySelectorAll(".message-row")].flatMap((row) =>
    [...row.querySelectorAll(".message-media")].map((media, mediaIndex) => ({
      url: media.dataset.mediaUrl,
      type: media.dataset.mediaType,
      messageId: row.dataset.messageId,
      mediaIndex,
    })),
  );

const renderMediaViewer = () => {
  const item = mediaViewerItems[mediaViewerIndex];
  if (!item) return;

  const background = document.createElement(item.type === "video" ? "video" : "img");
  background.className = "media-viewer-background-asset";
  background.src = item.url;
  if (item.type === "video") {
    background.muted = true;
    background.loop = true;
    background.autoplay = true;
    background.playsInline = true;
  } else {
    background.alt = "";
  }
  mediaViewerBackground.replaceChildren(background);

  const asset = document.createElement(item.type === "video" ? "video" : "img");
  asset.className = "media-viewer-asset";
  asset.src = item.url;
  if (item.type === "video") {
    asset.controls = true;
    asset.autoplay = true;
    asset.playsInline = true;
  } else {
    asset.alt = "Expanded shared image";
  }
  mediaViewerContent.replaceChildren(asset);
  mediaViewerCounter.textContent = `${mediaViewerIndex + 1} / ${mediaViewerItems.length}`;
  mediaViewerPrevious.disabled = mediaViewerItems.length < 2;
  mediaViewerNext.disabled = mediaViewerItems.length < 2;

  const thumbnails = mediaViewerItems.map((mediaItem, index) => {
    const thumbnail = document.createElement("button");
    thumbnail.className = `media-viewer-thumbnail${index === mediaViewerIndex ? " active" : ""}`;
    thumbnail.type = "button";
    thumbnail.dataset.viewerIndex = String(index);
    thumbnail.setAttribute("aria-label", `View media ${index + 1}`);
    thumbnail.setAttribute("aria-current", String(index === mediaViewerIndex));

    const preview = document.createElement(mediaItem.type === "video" ? "video" : "img");
    preview.className = "media-viewer-thumbnail-asset";
    preview.src = mediaItem.url;
    if (mediaItem.type === "video") {
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = "metadata";
      const videoMark = document.createElement("span");
      videoMark.className = "media-viewer-video-mark";
      videoMark.textContent = "Video";
      thumbnail.append(preview, videoMark);
    } else {
      preview.alt = "";
      preview.loading = "lazy";
      thumbnail.append(preview);
    }
    return thumbnail;
  });
  mediaViewerThumbnails.replaceChildren(...thumbnails);
  mediaViewerThumbnails.querySelector(".active")?.scrollIntoView({
    block: "nearest",
    inline: "center",
  });
};

const openMediaViewer = (messageId, mediaIndex) => {
  mediaViewerItems = collectConversationMedia();
  mediaViewerIndex = mediaViewerItems.findIndex(
    (item) => item.messageId === messageId && item.mediaIndex === mediaIndex,
  );
  if (mediaViewerIndex < 0) return;
  mediaViewer.showModal();
  renderMediaViewer();
};

const moveMediaViewer = (offset) => {
  if (mediaViewerItems.length < 2) return;
  mediaViewerIndex =
    (mediaViewerIndex + offset + mediaViewerItems.length) % mediaViewerItems.length;
  renderMediaViewer();
};

messages.addEventListener("click", (event) => {
  const openButton = event.target.closest(".media-open");
  if (openButton) {
    openMediaViewer(openButton.dataset.messageId, Number(openButton.dataset.mediaIndex));
    return;
  }

  const image = event.target.closest("img.message-media");
  if (image) {
    const row = image.closest(".message-row");
    openMediaViewer(row.dataset.messageId, Number(image.dataset.mediaIndex));
  }
});
mediaViewerClose.addEventListener("click", () => mediaViewer.close());
mediaViewerBackground.addEventListener("click", () => mediaViewer.close());
mediaViewerPrevious.addEventListener("click", () => moveMediaViewer(-1));
mediaViewerNext.addEventListener("click", () => moveMediaViewer(1));
mediaViewerThumbnails.addEventListener("click", (event) => {
  const thumbnail = event.target.closest(".media-viewer-thumbnail");
  if (!thumbnail) return;
  mediaViewerIndex = Number(thumbnail.dataset.viewerIndex);
  renderMediaViewer();
});
mediaViewer.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveMediaViewer(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveMediaViewer(1);
  }
});
mediaViewerDownload.addEventListener("click", async () => {
  const item = mediaViewerItems[mediaViewerIndex];
  if (!item || !currentConversation) return;
  mediaViewerDownload.disabled = true;
  try {
    await downloadConversationMedia({
      conversationId: currentConversation._id,
      messageId: item.messageId,
      mediaIndex: item.mediaIndex,
    });
  } catch (error) {
    showError(error.message);
  } finally {
    mediaViewerDownload.disabled = false;
  }
});
mediaViewerShare.addEventListener("click", async () => {
  const item = mediaViewerItems[mediaViewerIndex];
  if (!item) return;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Shared media", url: item.url });
      return;
    }
    await navigator.clipboard.writeText(item.url);
    mediaViewerShare.title = "Link copied";
    setTimeout(() => { mediaViewerShare.title = "Share"; }, 1600);
  } catch (error) {
    if (error.name !== "AbortError") showError("Could not share media link");
  }
});
mediaViewer.addEventListener("close", () => {
  mediaViewerContent.replaceChildren();
  mediaViewerBackground.replaceChildren();
  mediaViewerThumbnails.replaceChildren();
  mediaViewerItems = [];
  mediaViewerIndex = -1;
});
messages.addEventListener("click", async (event) => {
  const downloadButton = event.target.closest(".media-download");
  if (!downloadButton || !currentConversation) return;

  const row = downloadButton.closest(".message-row");
  downloadButton.disabled = true;
  try {
    await downloadConversationMedia({
      conversationId: currentConversation._id,
      messageId: row.dataset.messageId,
      mediaIndex: Number(downloadButton.dataset.mediaIndex),
    });
  } catch (error) {
    showError(error.message);
  } finally {
    downloadButton.disabled = false;
  }
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
    if (currentConversation?._id === message.conversation) {
      appendMessage(message);
      socket.emit("conversation:read", { conversationId: message.conversation });
    }
    loadConversations();
  });
  socket.on("message:deleted", showMessageDeleted);
  socket.on("message:notification", showMessageNotification);
  socket.on("conversation:updated", async ({ conversationId }) => {
    const conversations = await loadConversations();
    if (currentConversation?._id === conversationId) {
      const updatedConversation = conversations.find(
        (conversation) => conversation._id === conversationId,
      );
      if (updatedConversation) {
        currentConversation = updatedConversation;
        setConversationHeader(updatedConversation);
        if (groupDetailsDialog.open) renderGroupDetails();
      }
    }
  });
  socket.on("conversation:hidden", async ({ conversationId }) => {
    if (currentConversation?._id === conversationId) {
      currentConversation = null;
      chatApp.classList.remove("chat-open");
      document.getElementById("welcome-state").classList.remove("hidden");
      document.getElementById("chat-header").classList.add("hidden");
      document.getElementById("composer-wrap").classList.add("hidden");
      messages.classList.add("hidden");
      messages.replaceChildren();
    }
    await loadConversations();
  });
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
  document.documentElement.classList.remove("chat-active");
  document.body.classList.remove("chat-active");
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
