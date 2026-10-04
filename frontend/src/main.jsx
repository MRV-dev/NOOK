import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { createRoot } from "react-dom/client";

const supportedMediaTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const maxMediaFiles = 8;
const maxMediaFileSize = 25 * 1024 * 1024;
const reactionOptions = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

const initials = (name = "?") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
const formatNames = (people) => {
  const names = people.map((person) => person.username);
  if (names.length < 2) return names[0] || "a member";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
};
const formatCallDuration = (seconds = 0) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (!minutes) return `${remainingSeconds} sec`;
  return remainingSeconds
    ? `${minutes} min ${remainingSeconds} sec`
    : `${minutes} min`;
};

const summarizeReactions = (reactions = [], currentUserId) => {
  const groups = new Map();
  reactions.forEach((reaction) => {
    const reactionUserId =
      typeof reaction.user === "object"
        ? reaction.user?._id || reaction.user?.id
        : reaction.user;
    const group = groups.get(reaction.emoji) || {
      emoji: reaction.emoji,
      count: 0,
      userIds: new Set(),
    };
    group.count += 1;
    group.userIds.add(String(reactionUserId));
    groups.set(reaction.emoji, group);
  });
  return [...groups.values()].map(({ emoji, count, userIds }) => ({
    emoji,
    count,
    selected: userIds.has(currentUserId),
  }));
};

const api = async (url, token, options = {}) => {
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
const fetchConversations = (token) => api("/api/conversations", token);

function Icon({ name, ...props }) {
  const paths = {
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </>
    ),
    group: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 8v6m3-3h-6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    back: <path d="m15 18-6-6 6-6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5m0-8h.01" />
      </>
    ),
    attach: (
      <path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    ),
    close: <path d="m18 6-12 12M6 6l12 12" />,
    smile: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9h.01M15 9h.01M8.5 14.5s1.4 2 3.5 2 3.5-2 3.5-2" />
      </>
    ),
    download: (
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3" />
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.1" />
      </>
    ),
    next: <path d="m9 18 6-6-6-6" />,
    expand: <path d="M15 3h6v6m-7 1 7-7M9 21H3v-6m7-1-7 7" />,
    chat: (
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
    ),
    video: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m16 10 5-3v10l-5-3" />
      </>
    ),
    microphone: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0m-7 7v5m-4 0h8" />
      </>
    ),
    micOff: (
      <>
        <path d="M9 9v5a3 3 0 0 0 5.1 2.1M15 9V5a3 3 0 0 0-5.8-1M5 10a7 7 0 0 0 12 4.9M19 10a7 7 0 0 1-.5 2.6M12 17v5m-4 0h8M3 3l18 18" />
      </>
    ),
    cameraOff: (
      <>
        <path d="m16 10 5-3v10l-5-3M3 7a2 2 0 0 1 2-2h7M16 7v-.5A1.5 1.5 0 0 0 14.5 5H14M3 7v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1M3 3l18 18" />
      </>
    ),
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.8a2 2 0 0 1-.6 1.7L7.5 9.6a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 1.7-.6l2.8.4a2 2 0 0 1 1.7 1.9z" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

function Avatar({ name, online = false, small = false }) {
  return (
    <span
      className={`avatar${small ? " small" : ""}${online ? " online" : ""}`}
    >
      {initials(name)}
    </span>
  );
}

function Dialog({ open, onClose, children, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} {...props}>
      {children}
    </dialog>
  );
}

function AuthScreen({ token, resetToken, onAuthenticated, onPasswordReset }) {
  const [mode, setMode] = useState(() => (resetToken ? "reset" : "login"));
  const [notice, setNotice] = useState("");
  const [noticeSuccess, setNoticeSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setNoticeSuccess(false);
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    try {
      if (mode === "forgot") {
        const result = await api("/api/users/forgot-password", token, {
          method: "POST",
          body: JSON.stringify({ email: form.get("email") }),
        });
        setNotice(result.message);
        setNoticeSuccess(true);
        return;
      }
      if (mode === "reset") {
        const result = await api("/api/users/reset-password", null, {
          method: "POST",
          body: JSON.stringify({ token: resetToken, password }),
        });
        onPasswordReset();
        setMode("login");
        setNotice(result.message);
        setNoticeSuccess(true);
        return;
      }

      const body = { email: form.get("email"), password };
      if (registering) body.username = form.get("username");
      const result = await api(
        `/api/users/${registering ? "register" : "login"}`,
        token,
        { method: "POST", body: JSON.stringify(body) },
      );
      onAuthenticated(result);
    } catch (reason) {
      setNotice(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const heading = {
    login: "Welcome back",
    register: "Create your account",
    forgot: "Forgot your password?",
    reset: "Set a new password",
  }[mode];
  const subtitle = {
    login: "Sign in to pick up where you left off.",
    register: "A name and email are all you need to get started.",
    forgot: "We’ll email a secure reset link if an account exists.",
    reset: "Choose a new password for your account.",
  }[mode];

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-aside">
          <div className="brand">
            <img className="brand-mark" src="/nook-logo.svg" alt="" />
            <span>NOOK</span>
          </div>
          <div>
            <h1>Good conversations start here.</h1>
            <p>A quieter place to catch up, share a thought, and stay close.</p>
          </div>
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">Your messages, together</span>
          <h2>{heading}</h2>
          <p className="subtle">{subtitle}</p>
          <form onSubmit={submit}>
            {registering && (
              <label className="field">
                Username
                <input
                  name="username"
                  minLength="3"
                  maxLength="30"
                  autoComplete="username"
                  required
                />
              </label>
            )}
            {mode !== "reset" && (
              <label className="field">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label className="field">
                {mode === "reset" ? "New password" : "Password"}
                <input
                  name="password"
                  type="password"
                  required
                  minLength="8"
                  maxLength="72"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>
            )}
            {mode === "login" && (
              <p className="auth-forgot">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setNotice("");
                  }}
                >
                  Forgot password?
                </button>
              </p>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {busy
                ? "Please wait..."
                : mode === "forgot"
                  ? "Send reset link"
                  : mode === "reset"
                    ? "Update password"
                    : registering
                      ? "Create account"
                      : "Sign in"}
            </button>
            <p
              className={`notice${noticeSuccess ? " success" : ""}`}
              role="status"
            >
              {notice}
            </p>
          </form>
          <p className="auth-switch">
            {mode === "login" && (
              <>
                <span>New here?</span>{" "}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setNotice("");
                  }}
                >
                  Create an account
                </button>
              </>
            )}
            {registering && (
              <>
                <span>Already have an account?</span>{" "}
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setNotice("");
                  }}
                >
                  Sign in
                </button>
              </>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setMode("login");
                  setNotice("");
                }}
              >
                Back to sign in
              </button>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
function ConversationItem({
  conversation,
  user,
  active,
  online,
  onOpen,
  onHide,
  onLeave,
}) {
  const other = conversation.participants.find(
    (person) => person._id !== user.id,
  );
  const name =
    conversation.type === "group"
      ? conversation.name
      : other?.username || "Conversation";
  return (
    <div className="conversation-entry">
      <button
        type="button"
        className={`conversation-item${active ? " active" : ""}`}
        onClick={onOpen}
      >
        <Avatar
          name={name}
          small
          online={
            conversation.type === "direct" &&
            Boolean(other && online.has(other._id))
          }
        />
        <span className="conversation-copy">
          <span className="conversation-top">
            <strong>{name}</strong>
            <time>
              {conversation.lastMessage
                ? new Date(
                    conversation.lastMessage.createdAt,
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : ""}
            </time>
          </span>
          <p>{conversation.lastMessage?.content || "Start a conversation"}</p>
        </span>
      </button>
      <details className="conversation-actions">
        <summary aria-label="Conversation options" title="Conversation options">
          ⋮
        </summary>
        <div className="conversation-menu">
          <button className="conversation-hide" type="button" onClick={onHide}>
            {conversation.type === "group"
              ? "Delete group chat"
              : "Delete chat"}
          </button>
          {conversation.type === "group" && (
            <button
              className="conversation-leave"
              type="button"
              onClick={onLeave}
            >
              Leave group
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

function SelectedPeople({ people, onRemove }) {
  return (
    <div className="group-selected" aria-live="polite">
      {people.map((person) => (
        <span className="group-selected-person" key={person._id}>
          <span>{person.username}</span>
          <button
            type="button"
            aria-label={`Remove ${person.username}`}
            onClick={() => onRemove(person._id)}
          >
            <Icon name="close" />
          </button>
        </span>
      ))}
    </div>
  );
}

function PersonResults({ people, online, selected, onToggle, emptyText }) {
  if (!people.length) return <p className="group-empty">{emptyText}</p>;
  return people.map((person) => {
    const isSelected = selected.has(person._id);
    return (
      <button
        key={person._id}
        type="button"
        className={`search-result group-member${isSelected ? " selected" : ""}`}
        aria-pressed={isSelected}
        onClick={() => onToggle(person)}
      >
        <Avatar name={person.username} small online={online.has(person._id)} />
        <strong>{person.username}</strong>
        <span className="group-member-state">
          {isSelected ? "Selected" : "Add"}
        </span>
      </button>
    );
  });
}

function MessageRow({
  message,
  user,
  onDelete,
  onOpenMedia,
  onDownload,
  onReact,
  onCallAgain,
  canCallAgain,
}) {
  const sender = message.sender;
  const senderId =
    typeof sender === "object" ? sender?._id || sender?.id : sender;
  if (message.kind === "call") {
    const status = message.callEvent?.status;
    const description =
      status === "completed"
        ? formatCallDuration(message.callEvent.durationSeconds)
        : status === "declined"
          ? "Declined"
          : status === "cancelled"
            ? "Cancelled"
            : "Missed";
    return (
      <div
        className={`call-log${senderId === user.id ? " mine" : ""}`}
        data-message-id={message._id}
      >
        <time className="call-log-time">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
        <div className="call-log-card">
          <div className="call-log-heading">
            <span className="call-log-icon">
              <Icon name="video" />
            </span>
            <span className="call-log-copy">
              <strong>Video call</strong>
              <span>{description}</span>
            </span>
          </div>
          <button
            className="call-log-again"
            type="button"
            disabled={!canCallAgain}
            onClick={onCallAgain}
          >
            Call again
          </button>
        </div>
      </div>
    );
  }
  if (message.kind === "system") {
    const actor = senderId === user.id ? "You" : sender?.username || "A member";
    const action =
      message.systemEvent?.action === "added" ? "added" : "removed";
    const members = formatNames(message.systemEvent?.members || []);
    const ending = action === "added" ? "to" : "from";
    return (
      <div className="system-message" role="status">
        {actor} {action} {members} {ending} the group.
      </div>
    );
  }
  const mine = senderId === user.id;
  const media =
    Array.isArray(message.media) && message.media.length
      ? message.media
      : message.mediaUrl
        ? [{ url: message.mediaUrl, type: message.mediaType }]
        : [];
  const photoStack =
    media.length > 1 && media.every((item) => item.type === "image");
  const reactionGroups = summarizeReactions(message.reactions, user.id);
  const canReact = !mine && !message.isDeleted;
  return (
    <div
      className={`message-row${mine ? " mine" : ""}`}
      data-message-id={message._id}
    >
      {!mine && (
        <div
          className={`message-meta${photoStack ? " media-stack-label" : ""}`}
        >
          {photoStack
            ? `${sender?.username || "Member"} sent ${media.length} photos`
            : sender?.username || "Member"}
        </div>
      )}
      <div className="message-content">
        {mine && !message.isDeleted && (
          <details className="message-actions">
            <summary aria-label="Message options" title="Message options">
              ⋮
            </summary>
            <div className="message-menu">
              <button
                className="message-delete"
                type="button"
                onClick={() => onDelete(message._id)}
              >
                Delete message
              </button>
            </div>
          </details>
        )}
        <div
          className={`bubble${media.length && !message.isDeleted ? " media-bubble" : ""}${message.isDeleted ? " deleted" : ""}`}
        >
          {media.length && !message.isDeleted ? (
            <>
              <div
                className={
                  photoStack
                    ? "message-media-stack"
                    : `message-media-grid${media.length === 1 ? " single" : ""}`
                }
              >
                {media.map((item, index) => (
                  <div
                    className={`message-media-item${photoStack ? " message-media-stack-item" : ""}`}
                    key={`${item.url}-${index}`}
                    hidden={photoStack && index >= 3}
                  >
                    {item.type === "video" ? (
                      <>
                        <video
                          className="message-media"
                          src={item.url}
                          controls
                          playsInline
                          preload="metadata"
                        />
                        <button
                          className="media-open"
                          type="button"
                          aria-label="Open video large"
                          onClick={() => onOpenMedia(message._id, index)}
                        >
                          <Icon name="expand" />
                        </button>
                      </>
                    ) : (
                      <img
                        className="message-media"
                        src={item.url}
                        alt={message.content || `Shared image ${index + 1}`}
                        loading="lazy"
                        onClick={() => onOpenMedia(message._id, index)}
                      />
                    )}
                    {!mine &&
                      item.type === "image" &&
                      (!photoStack ||
                        index === Math.min(2, media.length - 1)) && (
                        <button
                          className="media-download"
                          type="button"
                          title="Download image"
                          aria-label="Download image"
                          onClick={() => onDownload(message._id, index)}
                        >
                          <Icon name="download" />
                        </button>
                      )}
                  </div>
                ))}
              </div>
              {message.content && (
                <span className="media-caption">{message.content}</span>
              )}
            </>
          ) : (
            message.content
          )}
        </div>
        {canReact && (
          <details className="message-reaction-picker">
            <summary aria-label="React to message" title="React to message">
              <Icon name="smile" />
            </summary>
            <div className="message-reaction-menu">
              {reactionOptions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React with ${emoji}`}
                  title={`React with ${emoji}`}
                  onClick={() => onReact(message._id, emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
      {!message.isDeleted && reactionGroups.length > 0 && (
        <div className="message-reaction-row">
          {reactionGroups.map(({ emoji, count, selected }) => (
            <button
              key={emoji}
              className={`message-reaction${selected ? " selected" : ""}`}
              type="button"
              aria-label={`${emoji}, ${count} reaction${count === 1 ? "" : "s"}`}
              aria-pressed={selected}
              disabled={!canReact}
              onClick={() => onReact(message._id, emoji)}
            >
              <span>{emoji}</span>
              <span className="message-reaction-count">{count}</span>
            </button>
          ))}
        </div>
      )}
      <div className="message-meta">
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() =>
    sessionStorage.getItem("chat-token"),
  );
  const [resetToken, setResetToken] = useState(() =>
    new URLSearchParams(window.location.search).get("resetToken"),
  );
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [online, setOnline] = useState(() => new Set());
  const [typingUser, setTypingUser] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("real-time-chat-theme") || "system";
    } catch {
      return "system";
    }
  });
  const [dialog, setDialog] = useState(null);
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupResults, setGroupResults] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [detailsName, setDetailsName] = useState("");
  const [dialogNotice, setDialogNotice] = useState("");
  const [messageText, setMessageText] = useState("");
  const [mediaFiles, setMediaFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [viewerItems, setViewerItems] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [notification, setNotification] = useState(null);
  const [error, setError] = useState("");
  const [call, setCall] = useState(null);
  const [callChromeVisible, setCallChromeVisible] = useState(true);
  const [callViewport, setCallViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const socketRef = useRef(null);
  const currentConversationRef = useRef(null);
  const callRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const initiatingPeersRef = useRef(new Set());
  const localStreamRef = useRef(null);
  const queuedIceRef = useRef(new Map());
  const localVideoRef = useRef(null);
  const desktopLocalVideoRef = useRef(null);
  const peerVideoRefs = useRef(new Map());
  const callChromeTimeoutRef = useRef(null);
  const mediaFilesRef = useRef([]);
  const messagesRef = useRef(null);
  const messageInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  const notificationTimeoutRef = useRef(null);
  const themeTransitionTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  currentConversationRef.current = currentConversation;
  mediaFilesRef.current = mediaFiles;

  const showError = (message) => {
    setError(message);
    clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setError(""), 3500);
  };

  const setThemeOrigin = (element) => {
    const bounds = element.getBoundingClientRect();
    const root = document.documentElement;
    root.style.setProperty(
      "--theme-origin-x",
      `${bounds.left + bounds.width / 2}px`,
    );
    root.style.setProperty(
      "--theme-origin-y",
      `${bounds.top + bounds.height / 2}px`,
    );
  };

  const updateCall = (update) => {
    const next = typeof update === "function" ? update(callRef.current) : update;
    callRef.current = next;
    setCall(next);
  };

  const cleanupCall = () => {
    peerConnectionsRef.current.forEach((peerConnection) =>
      peerConnection.close(),
    );
    peerConnectionsRef.current.clear();
    initiatingPeersRef.current.clear();
    queuedIceRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    updateCall(null);
  };

  const cleanupPeerConnection = (peerId) => {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    queuedIceRef.current.delete(peerId);
    updateCall((activeCall) =>
      activeCall
        ? {
            ...activeCall,
            peers: activeCall.peers.filter((peer) => peer.id !== peerId),
          }
        : activeCall,
    );
  };

  const flushQueuedIce = async (peerId, peerConnection) => {
    const candidates = queuedIceRef.current.get(peerId) || [];
    queuedIceRef.current.delete(peerId);
    for (const candidate of candidates) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const createPeerConnection = (conversationId, callId, peer) => {
    const existingConnection = peerConnectionsRef.current.get(peer.id);
    if (existingConnection) return existingConnection;
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerConnectionsRef.current.set(peer.id, peerConnection);
    localStreamRef.current?.getTracks().forEach((track) =>
      peerConnection.addTrack(track, localStreamRef.current),
    );
    peerConnection.onicecandidate = ({ candidate }) => {
      if (!candidate || callRef.current?.callId !== callId) return;
      socketRef.current?.emit("call:ice", {
        conversationId,
        callId,
        peerId: peer.id,
        candidate: candidate.toJSON(),
      });
    };
    peerConnection.ontrack = ({ streams, track }) => {
      const remoteStream = streams[0] || new MediaStream([track]);
      updateCall((activeCall) =>
        activeCall?.callId === callId
          ? {
              ...activeCall,
              peers: [
                ...activeCall.peers.filter((item) => item.id !== peer.id),
                { ...peer, stream: remoteStream },
              ],
            }
          : activeCall,
      );
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "connected") {
        updateCall((activeCall) =>
          activeCall?.callId === callId
            ? { ...activeCall, status: "connected" }
            : activeCall,
        );
      } else if (peerConnection.connectionState === "failed") {
        cleanupPeerConnection(peer.id);
      }
    };
    return peerConnection;
  };

  const connectToParticipant = async (activeCall, peer) => {
    if (callRef.current?.callId !== activeCall.callId || peer.id === user.id)
      return;
    const peerConnection = createPeerConnection(
      activeCall.conversationId,
      activeCall.callId,
      peer,
    );
    if (
      user.id.localeCompare(peer.id) >= 0 ||
      peerConnection.signalingState !== "stable" ||
      initiatingPeersRef.current.has(peer.id)
    ) {
      return;
    }

    initiatingPeersRef.current.add(peer.id);
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (callRef.current?.callId !== activeCall.callId) return;
      socketRef.current?.emit(
        "call:offer",
        {
          conversationId: activeCall.conversationId,
          callId: activeCall.callId,
          peerId: peer.id,
          offer,
        },
        (result) => {
          if (!result?.ok) cleanupPeerConnection(peer.id);
        },
      );
    } catch (reason) {
      cleanupPeerConnection(peer.id);
      showError(reason.message || "Could not connect to a call participant");
    } finally {
      initiatingPeersRef.current.delete(peer.id);
    }
  };

  const startCall = async () => {
    const activeConversation = currentConversationRef.current;
    const onlineParticipants = activeConversation?.participants.filter(
      (participant) =>
        participant._id !== user?.id && online.has(participant._id),
    );
    if (
      !activeConversation ||
      !onlineParticipants?.length ||
      callRef.current
    ) {
      if (activeConversation && !onlineParticipants?.length)
        showError("No one else in this conversation is online");
      return;
    }

    const callId = crypto.randomUUID();
    updateCall({
      conversationId: activeConversation._id,
      callId,
      callerId: user.id,
      peerName:
        activeConversation.type === "group"
          ? activeConversation.name
          : onlineParticipants[0].username,
      conversationName: activeConversation.name,
      isGroup: activeConversation.type === "group",
      status: "calling",
      signalingReady: false,
      localStream: null,
      peers: [],
      members: [{ id: user.id, username: user.username }],
      invitedCount: onlineParticipants.length,
      muted: false,
      cameraOff: false,
    });
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      if (callRef.current?.callId !== callId) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = localStream;
      updateCall((activeCall) =>
        activeCall?.callId === callId
          ? { ...activeCall, localStream }
          : activeCall,
      );
      socketRef.current?.emit(
        "call:start",
        { conversationId: activeConversation._id, callId },
        (result) => {
          if (!result?.ok) {
            if (callRef.current?.callId === callId) cleanupCall();
            showError(result?.message || "Could not start the call");
            return;
          }
          updateCall((activeCall) =>
            activeCall?.callId === callId
              ? { ...activeCall, signalingReady: true }
              : activeCall,
          );
        },
      );
    } catch (reason) {
      if (callRef.current?.callId === callId) cleanupCall();
      showError(
        reason.name === "NotAllowedError"
          ? "Allow camera and microphone access to make a call"
          : reason.message || "Could not access your camera and microphone",
      );
    }
  };

  const acceptCall = async () => {
    const activeCall = callRef.current;
    if (!activeCall || activeCall.status !== "incoming") return;
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      if (callRef.current?.callId !== activeCall.callId) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = localStream;
      updateCall((current) =>
        current?.callId === activeCall.callId
          ? { ...current, status: "connecting", localStream }
          : current,
      );
      socketRef.current?.emit(
        "call:join",
        {
          conversationId: activeCall.conversationId,
          callId: activeCall.callId,
        },
        async (result) => {
          if (!result?.ok) {
            if (callRef.current?.callId === activeCall.callId) cleanupCall();
            showError(result?.message || "Could not join the call");
            return;
          }
          const participants = result.participants || [];
          updateCall((current) =>
            current?.callId === activeCall.callId
              ? {
                  ...current,
                  signalingReady: true,
                  members: [
                    ...participants,
                    { id: user.id, username: user.username },
                  ],
                }
              : current,
          );
          const joinedCall = callRef.current;
          for (const participant of participants) {
            await connectToParticipant(joinedCall, participant);
          }
        },
      );
    } catch (reason) {
      socketRef.current?.emit("call:reject", {
        conversationId: activeCall.conversationId,
        callId: activeCall.callId,
      });
      cleanupCall();
      showError(
        reason.name === "NotAllowedError"
          ? "Allow camera and microphone access to answer"
          : reason.message || "Could not answer the call",
      );
    }
  };

  const rejectCall = () => {
    const activeCall = callRef.current;
    if (!activeCall) return;
    socketRef.current?.emit("call:reject", {
      conversationId: activeCall.conversationId,
      callId: activeCall.callId,
    });
    cleanupCall();
  };

  const endCall = () => {
    const activeCall = callRef.current;
    if (!activeCall) return;
    socketRef.current?.emit(
      activeCall.status === "incoming"
        ? "call:reject"
        : activeCall.callerId === user.id
          ? "call:end"
          : "call:leave",
      {
        conversationId: activeCall.conversationId,
        callId: activeCall.callId,
      },
    );
    cleanupCall();
  };

  const toggleCallAudio = () => {
    const activeCall = callRef.current;
    if (!activeCall) return;
    const muted = !activeCall.muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    updateCall({ ...activeCall, muted });
  };

  const toggleCallVideo = () => {
    const activeCall = callRef.current;
    if (!activeCall) return;
    const cameraOff = !activeCall.cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOff;
    });
    updateCall({ ...activeCall, cameraOff });
  };

  useEffect(() => {
    if (!token) {
      setUser(null);
      return undefined;
    }
    let active = true;
    api("/api/users/me", token)
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        if (!active) return;
        sessionStorage.removeItem("chat-token");
        setToken(null);
        setUser(null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    document.documentElement.classList.toggle("chat-active", Boolean(user));
    document.body.classList.toggle("chat-active", Boolean(user));
    return () => {
      document.documentElement.classList.remove("chat-active");
      document.body.classList.remove("chat-active");
    };
  }, [user]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const root = document.documentElement;
      const nextTheme =
        theme === "dark" || (theme === "system" && mediaQuery.matches)
          ? "dark"
          : "light";
      if (root.dataset.theme && root.dataset.theme !== nextTheme) {
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        if (!reduceMotion && document.startViewTransition) {
          document.startViewTransition(() => {
            root.dataset.theme = nextTheme;
          });
          return;
        }
        if (!reduceMotion) {
          root.classList.add("theme-transitioning");
          clearTimeout(themeTransitionTimeoutRef.current);
          themeTransitionTimeoutRef.current = setTimeout(() => {
            root.classList.remove("theme-transitioning");
          }, 260);
        }
      }
      root.dataset.theme = nextTheme;
    };
    const changeTheme = () => {
      if (theme === "system") applyTheme();
    };
    applyTheme();
    mediaQuery.addEventListener("change", changeTheme);
    try {
      localStorage.setItem("real-time-chat-theme", theme);
    } catch {}
    return () => mediaQuery.removeEventListener("change", changeTheme);
  }, [theme]);

  useEffect(() => {
    if (!token || !user) return undefined;
    let active = true;
    const refresh = () =>
      fetchConversations(token)
        .then((items) => {
          if (active) setConversations(items);
        })
        .catch((reason) => showError(reason.message));
    refresh();
    const socket = io({ auth: { token } });
    socketRef.current = socket;
    socket.on("connect_error", (reason) => showError(reason.message));
    socket.on("presence:list", (ids) => setOnline(new Set(ids)));
    socket.on("presence:online", ({ userId }) =>
      setOnline((previous) => new Set(previous).add(userId)),
    );
    socket.on("presence:offline", ({ userId }) =>
      setOnline((previous) => {
        const next = new Set(previous);
        next.delete(userId);
        return next;
      }),
    );
    socket.on("message:new", (message) => {
      if (currentConversationRef.current?._id === message.conversation) {
        setMessages((previous) =>
          previous.some((item) => item._id === message._id)
            ? previous
            : [...previous, message],
        );
        socket.emit("conversation:read", {
          conversationId: message.conversation,
        });
      }
      refresh();
    });
    socket.on("message:deleted", ({ messageId }) =>
      setMessages((previous) =>
        previous.map((item) =>
          item._id === messageId
            ? {
                ...item,
                content: "Message deleted",
                isDeleted: true,
                media: [],
              }
            : item,
        ),
      ),
    );
    socket.on(
      "message:reactions",
      ({ conversationId, messageId, reactions }) => {
        if (currentConversationRef.current?._id !== conversationId) return;
        setMessages((previous) =>
          previous.map((message) =>
            message._id === messageId ? { ...message, reactions } : message,
          ),
        );
      },
    );
    socket.on("message:notification", ({ conversationId, sender, content }) => {
      if (currentConversationRef.current?._id === conversationId) return;
      setNotification({
        conversationId,
        sender: sender?.username || "New message",
        content,
      });
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = setTimeout(
        () => setNotification(null),
        5500,
      );
      refresh();
    });
    socket.on("conversation:updated", async ({ conversationId }) => {
      try {
        const items = await fetchConversations(token);
        if (!active) return;
        setConversations(items);
        const updated = items.find((item) => item._id === conversationId);
        if (updated && currentConversationRef.current?._id === conversationId)
          setCurrentConversation(updated);
      } catch (reason) {
        showError(reason.message);
      }
    });
    socket.on("conversation:hidden", ({ conversationId }) => {
      if (currentConversationRef.current?._id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
      refresh();
    });
    socket.on("typing:update", ({ conversationId, user: sender, isTyping }) => {
      if (currentConversationRef.current?._id === conversationId)
        setTypingUser(isTyping ? `${sender.username} is typing...` : "");
    });
    socket.on("call:incoming", (incomingCall) => {
      if (callRef.current) {
        socket.emit("call:reject", incomingCall);
        return;
      }
      updateCall({
        ...incomingCall,
        callerId: incomingCall.caller.id,
        peerName: incomingCall.isGroup
          ? incomingCall.conversationName
          : incomingCall.caller.username,
        status: "incoming",
        signalingReady: true,
        localStream: null,
        peers: [],
        members: [incomingCall.caller],
        declined: [],
        muted: false,
        cameraOff: false,
      });
    });
    socket.on("call:participant-joined", (payload) => {
      const { callId, participant } = payload;
      if (
        callRef.current?.callId !== callId ||
        participant.id === user.id
      ) {
        return;
      }
      updateCall((activeCall) =>
        activeCall?.callId === callId
          ? {
              ...activeCall,
              members: [
                ...activeCall.members.filter(
                  (member) => member.id !== participant.id,
                ),
                participant,
              ],
            }
          : activeCall,
      );
      connectToParticipant(callRef.current, participant);
    });
    socket.on("call:offer", async ({ callId, from, offer }) => {
      const activeCall = callRef.current;
      if (activeCall?.callId !== callId) return;
      const peerConnection = createPeerConnection(
        activeCall.conversationId,
        callId,
        from,
      );
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        await flushQueuedIce(from.id, peerConnection);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("call:answer", {
          conversationId: activeCall.conversationId,
          callId,
          peerId: from.id,
          answer,
        });
        updateCall((activeCall) =>
          activeCall?.callId === callId
            ? { ...activeCall, status: "connecting" }
            : activeCall,
        );
      } catch (reason) {
        cleanupPeerConnection(from.id);
        showError(reason.message || "Could not connect to a participant");
      }
    });
    socket.on("call:answer", async ({ callId, from, answer }) => {
      if (callRef.current?.callId !== callId) return;
      const peerConnection = peerConnectionsRef.current.get(from.id);
      if (!peerConnection) return;
      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer),
        );
        await flushQueuedIce(from.id, peerConnection);
      } catch (reason) {
        cleanupPeerConnection(from.id);
        showError(reason.message || "Could not connect to a participant");
      }
    });
    socket.on("call:ice", async ({ callId, from, candidate }) => {
      if (callRef.current?.callId !== callId) return;
      const peerConnection = peerConnectionsRef.current.get(from);
      if (!peerConnection?.remoteDescription) {
        queuedIceRef.current.set(from, [
          ...(queuedIceRef.current.get(from) || []),
          candidate,
        ]);
        return;
      }
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (reason) {
        showError(reason.message || "Could not establish the call connection");
      }
    });
    socket.on("call:invite-declined", ({ callId, participant }) => {
      if (callRef.current?.callId !== callId) return;
      updateCall((activeCall) =>
        activeCall?.callId === callId
          ? { ...activeCall, declined: [...activeCall.declined, participant] }
          : activeCall,
      );
    });
    socket.on("call:participant-left", ({ callId, participantId }) => {
      if (callRef.current?.callId !== callId) return;
      cleanupPeerConnection(participantId);
      updateCall((activeCall) =>
        activeCall?.callId === callId
          ? {
              ...activeCall,
              members: activeCall.members.filter(
                (member) => member.id !== participantId,
              ),
            }
          : activeCall,
      );
    });
    socket.on("call:ended", ({ callId }) => {
      if (callRef.current?.callId === callId) cleanupCall();
    });
    return () => {
      active = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = call?.localStream || null;
    }
    if (desktopLocalVideoRef.current) {
      desktopLocalVideoRef.current.srcObject = call?.localStream || null;
    }
    call?.peers?.forEach((peer) => {
      const video = peerVideoRefs.current.get(peer.id);
      if (!video) return;
      if (video.srcObject !== peer.stream) video.srcObject = peer.stream;
      video.play().catch(() => {});
    });
  }, [call?.localStream, call?.peers]);

  useEffect(() => {
    if (!call?.isGroup) return undefined;
    const updateViewport = () =>
      setCallViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, [call?.isGroup]);

  useEffect(() => {
    clearTimeout(callChromeTimeoutRef.current);
    if (!call || call.status === "incoming") {
      setCallChromeVisible(true);
      return undefined;
    }

    const revealCallChrome = () => {
      setCallChromeVisible(true);
      clearTimeout(callChromeTimeoutRef.current);
      callChromeTimeoutRef.current = setTimeout(
        () => setCallChromeVisible(false),
        3000,
      );
    };
    revealCallChrome();
    document.addEventListener("pointermove", revealCallChrome, {
      passive: true,
    });
    document.addEventListener("pointerdown", revealCallChrome);
    document.addEventListener("keydown", revealCallChrome);
    return () => {
      clearTimeout(callChromeTimeoutRef.current);
      document.removeEventListener("pointermove", revealCallChrome);
      document.removeEventListener("pointerdown", revealCallChrome);
      document.removeEventListener("keydown", revealCallChrome);
    };
  }, [call?.callId, call?.status]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || !token) {
      setSearchResults([]);
      return undefined;
    }
    let active = true;
    const timeout = setTimeout(
      () =>
        api(`/api/users/search?q=${encodeURIComponent(query)}`, token)
          .then((people) => {
            if (active) setSearchResults(people);
          })
          .catch((reason) => showError(reason.message)),
      220,
    );
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [search, token]);

  useEffect(() => {
    const query = groupSearch.trim();
    if (dialog !== "create" || query.length < 2 || !token) {
      setGroupResults([]);
      return undefined;
    }
    let active = true;
    const timeout = setTimeout(
      () =>
        api(`/api/users/search?q=${encodeURIComponent(query)}`, token)
          .then((people) => {
            if (active) setGroupResults(people);
          })
          .catch((reason) => setDialogNotice(reason.message)),
      220,
    );
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [dialog, groupSearch, token]);

  useEffect(() => {
    const query = memberSearch.trim();
    if (dialog !== "members" || query.length < 2 || !token) {
      setMemberResults([]);
      return undefined;
    }
    let active = true;
    const timeout = setTimeout(
      () =>
        api(`/api/users/search?q=${encodeURIComponent(query)}`, token)
          .then((people) => {
            if (active) setMemberResults(people);
          })
          .catch((reason) => setDialogNotice(reason.message)),
      220,
    );
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [dialog, memberSearch, token]);

  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, currentConversation?._id]);

  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;
    input.style.height = "44px";
    const maxHeight = Math.min(160, window.innerHeight * 0.3);
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [messageText]);

  useEffect(
    () => () => {
      mediaFilesRef.current.forEach((item) =>
        URL.revokeObjectURL(item.previewUrl),
      );
      clearTimeout(errorTimeoutRef.current);
      clearTimeout(notificationTimeoutRef.current);
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(themeTransitionTimeoutRef.current);
    },
    [],
  );

  const refreshConversations = async () => {
    try {
      setConversations(await fetchConversations(token));
    } catch (reason) {
      showError(reason.message);
    }
  };

  const openConversation = async (conversation) => {
    if (
      currentConversationRef.current?._id !== conversation._id &&
      mediaFiles.length
    ) {
      mediaFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setMediaFiles([]);
    }
    if (isTypingRef.current && currentConversationRef.current) {
      socketRef.current?.emit("typing:set", {
        conversationId: currentConversationRef.current._id,
        isTyping: false,
      });
      isTypingRef.current = false;
    }
    setCurrentConversation(conversation);
    setTypingUser("");
    setMessages([]);
    setSearch("");
    setSearchOpen(false);
    try {
      const result = await new Promise((resolve) =>
        socketRef.current?.emit(
          "conversation:join",
          { conversationId: conversation._id },
          resolve,
        ),
      );
      if (!result?.ok)
        throw new Error(result?.message || "Could not join conversation");
      const history = await api(
        `/api/conversations/${conversation._id}/messages?limit=100`,
        token,
      );
      if (currentConversationRef.current?._id !== conversation._id) return;
      setMessages(history);
      socketRef.current?.emit("conversation:read", {
        conversationId: conversation._id,
      });
    } catch (reason) {
      showError(reason.message);
    }
    refreshConversations();
  };

  const startDirectConversation = async (person) => {
    try {
      const conversation = await api("/api/conversations", token, {
        method: "POST",
        body: JSON.stringify({ type: "direct", participants: [person._id] }),
      });
      await refreshConversations();
      openConversation(conversation);
    } catch (reason) {
      showError(reason.message);
    }
  };

  const hideConversation = async (conversationId) => {
    try {
      await api(`/api/conversations/${conversationId}`, token, {
        method: "DELETE",
      });
      if (currentConversationRef.current?._id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
      await refreshConversations();
    } catch (reason) {
      showError(reason.message);
    }
  };

  const leaveGroup = async (conversation) => {
    if (
      !window.confirm(
        `Leave ${conversation.name}? You may need to be added again to rejoin.`,
      )
    )
      return;
    try {
      await api(`/api/conversations/${conversation._id}/leave`, token, {
        method: "POST",
      });
      if (currentConversationRef.current?._id === conversation._id) {
        setCurrentConversation(null);
        setMessages([]);
      }
      await refreshConversations();
    } catch (reason) {
      showError(reason.message);
    }
  };

  const kickMember = async (person) => {
    if (!currentConversation) return;
    if (
      !window.confirm(
        `Remove ${person.username} from ${currentConversation.name}?`,
      )
    )
      return;
    try {
      const updated = await api(
        `/api/conversations/${currentConversation._id}/participants/${person._id}`,
        token,
        { method: "DELETE" },
      );
      setCurrentConversation(updated);
      setConversations((previous) =>
        previous.map((item) => (item._id === updated._id ? updated : item)),
      );
    } catch (reason) {
      showError(reason.message);
    }
  };

  const createGroup = async (event) => {
    event.preventDefault();
    setDialogNotice("");
    try {
      const conversation = await api("/api/conversations", token, {
        method: "POST",
        body: JSON.stringify({
          type: "group",
          name: groupName.trim(),
          participants: selectedGroup.map((person) => person._id),
        }),
      });
      setDialog(null);
      await refreshConversations();
      openConversation(conversation);
    } catch (reason) {
      setDialogNotice(reason.message);
    }
  };

  const addMembers = async (event) => {
    event.preventDefault();
    if (!currentConversation) return;
    setDialogNotice("");
    try {
      const updated = await api(
        `/api/conversations/${currentConversation._id}/participants`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            participants: selectedMembers.map((person) => person._id),
          }),
        },
      );
      setCurrentConversation(updated);
      setConversations((previous) =>
        previous.map((item) => (item._id === updated._id ? updated : item)),
      );
      setDialog(null);
      refreshConversations();
    } catch (reason) {
      setDialogNotice(reason.message);
    }
  };

  const saveGroupName = async (event) => {
    event.preventDefault();
    if (!currentConversation) return;
    setDialogNotice("");
    try {
      const updated = await api(
        `/api/conversations/${currentConversation._id}`,
        token,
        { method: "PATCH", body: JSON.stringify({ name: detailsName.trim() }) },
      );
      setCurrentConversation(updated);
      setConversations((previous) =>
        previous.map((item) => (item._id === updated._id ? updated : item)),
      );
      refreshConversations();
    } catch (reason) {
      setDialogNotice(reason.message);
    }
  };

  const togglePerson = (setter, people, person) =>
    setter(
      people.some((item) => item._id === person._id)
        ? people.filter((item) => item._id !== person._id)
        : [...people, person],
    );

  const onSelectFiles = (event) => {
    const next = [...mediaFiles];
    for (const file of event.target.files || []) {
      if (!supportedMediaTypes.has(file.type)) {
        showError(`${file.name} is not a supported image or video`);
        continue;
      }
      if (file.size > maxMediaFileSize) {
        showError(`${file.name} is larger than 25 MB`);
        continue;
      }
      if (next.length >= maxMediaFiles) {
        showError("You can attach up to 8 files per message");
        break;
      }
      next.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    setMediaFiles(next);
    event.target.value = "";
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!currentConversation || (!messageText.trim() && !mediaFiles.length))
      return;
    setSending(true);
    try {
      if (mediaFiles.length) {
        const body = new FormData();
        mediaFiles.forEach(({ file }) => body.append("media", file));
        if (messageText.trim()) body.append("content", messageText.trim());
        await api(
          `/api/conversations/${currentConversation._id}/messages/media`,
          token,
          { method: "POST", body },
        );
        mediaFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setMediaFiles([]);
        setMessageText("");
        const history = await api(
          `/api/conversations/${currentConversation._id}/messages?limit=100`,
          token,
        );
        if (currentConversationRef.current?._id === currentConversation._id)
          setMessages(history);
        refreshConversations();
      } else {
        const socket = socketRef.current;
        if (!socket?.connected)
          throw new Error("Reconnecting to chat. Try again in a moment.");
        const result = await new Promise((resolve) =>
          socket.emit(
            "message:send",
            {
              conversationId: currentConversation._id,
              content: messageText.trim(),
            },
            resolve,
          ),
        );
        if (!result?.ok)
          throw new Error(result?.message || "Could not send message");
        setMessages((previous) =>
          previous.some((item) => item._id === result.message._id)
            ? previous
            : [...previous, result.message],
        );
        setMessageText("");
        refreshConversations();
      }
      if (isTypingRef.current) {
        socketRef.current?.emit("typing:set", {
          conversationId: currentConversation._id,
          isTyping: false,
        });
        isTypingRef.current = false;
      }
    } catch (reason) {
      showError(reason.message);
    } finally {
      setSending(false);
    }
  };

  const handleMessageInput = (value) => {
    setMessageText(value);
    if (!currentConversation || !socketRef.current?.connected) return;
    if (!isTypingRef.current) {
      socketRef.current.emit("typing:set", {
        conversationId: currentConversation._id,
        isTyping: true,
      });
      isTypingRef.current = true;
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current && currentConversationRef.current)
        socketRef.current?.emit("typing:set", {
          conversationId: currentConversationRef.current._id,
          isTyping: false,
        });
      isTypingRef.current = false;
    }, 900);
  };

  const deleteMessage = (messageId) => {
    if (!currentConversation || !socketRef.current?.connected) return;
    socketRef.current.emit(
      "message:delete",
      { conversationId: currentConversation._id, messageId },
      (result) => {
        if (!result?.ok)
          showError(result?.message || "Could not delete message");
      },
    );
  };

  const toggleReaction = (messageId, emoji) => {
    const socket = socketRef.current;
    if (!currentConversation || !socket?.connected) {
      showError("Reconnecting to chat. Try again in a moment.");
      return;
    }
    socket.emit(
      "message:react",
      { conversationId: currentConversation._id, messageId, emoji },
      (result) => {
        if (!result?.ok)
          showError(result?.message || "Could not update reaction");
      },
    );
  };

  const downloadMedia = async (messageId, mediaIndex) => {
    if (!currentConversation) return;
    try {
      const response = await fetch(
        `/api/conversations/${currentConversation._id}/messages/${messageId}/media/${mediaIndex}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not download media");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "shared-media";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (reason) {
      showError(reason.message);
    }
  };

  const openViewer = (messageId, mediaIndex) => {
    const items = messages.flatMap((message) => {
      const media =
        Array.isArray(message.media) && message.media.length
          ? message.media
          : message.mediaUrl
            ? [{ url: message.mediaUrl, type: message.mediaType }]
            : [];
      return media.map((item, index) => ({
        ...item,
        messageId: message._id,
        mediaIndex: index,
      }));
    });
    const index = items.findIndex(
      (item) => item.messageId === messageId && item.mediaIndex === mediaIndex,
    );
    if (index >= 0) {
      setViewerItems(items);
      setViewerIndex(index);
    }
  };
  const closeViewer = () => {
    setViewerItems([]);
    setViewerIndex(-1);
  };
  const moveViewer = (offset) =>
    setViewerIndex(
      (index) => (index + offset + viewerItems.length) % viewerItems.length,
    );

  useEffect(() => {
    if (viewerIndex < 0) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerIndex, viewerItems.length]);

  const logout = () => {
    endCall();
    socketRef.current?.disconnect();
    sessionStorage.removeItem("chat-token");
    setToken(null);
    setUser(null);
    setConversations([]);
    setCurrentConversation(null);
    setMessages([]);
    mediaFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setMediaFiles([]);
    setNotification(null);
  };
  const openCreateGroup = () => {
    setGroupName("");
    setGroupSearch("");
    setGroupResults([]);
    setSelectedGroup([]);
    setDialogNotice("");
    setDialog("create");
  };
  const openAddMembers = () => {
    setMemberSearch("");
    setMemberResults([]);
    setSelectedMembers([]);
    setDialogNotice("");
    setDialog("members");
  };
  const openGroupDetails = () => {
    setDetailsName(currentConversation?.name || "");
    setDialogNotice("");
    setDialog("details");
  };

  const otherParticipants =
    currentConversation?.participants.filter(
      (person) => person._id !== user?.id,
    ) || [];
  const headerName =
    currentConversation?.type === "group"
      ? currentConversation.name
      : otherParticipants[0]?.username || "Conversation";
  const headerOnline =
    currentConversation?.type === "direct" &&
    Boolean(otherParticipants[0] && online.has(otherParticipants[0]._id));
  const groupCallMemberCount = call?.members.length || 1;
  const portraitCall = callViewport.height > callViewport.width * 1.15;
  const desktopDirectCall =
    call && !call.isGroup && callViewport.width > 720;
  const twoPersonGroupPip =
    call?.isGroup &&
    call.members.length === 2 &&
    (callViewport.width <= 720 || portraitCall);
  const groupCallColumns = Math.min(
    callViewport.width <= 720 || portraitCall ? 2 : 4,
    Math.ceil(Math.sqrt(groupCallMemberCount)),
  );
  const groupCallRows = Math.ceil(groupCallMemberCount / groupCallColumns);
  const groupCallTileRatio = portraitCall ? 1 : 16 / 9;
  const groupCallGridWidth = Math.min(
    callViewport.width - 32,
    1440,
    ((callViewport.height - 166 - 8 * (groupCallRows - 1)) / groupCallRows) *
      groupCallTileRatio *
      groupCallColumns +
      8 * (groupCallColumns - 1),
  );
  const groupCallTileStyle = (index) => {
    const remainder = groupCallMemberCount % groupCallColumns;
    const lastRowStart = groupCallMemberCount - remainder;
    if (remainder && index >= lastRowStart) {
      const startColumn =
        groupCallColumns - remainder + 1 + (index - lastRowStart) * 2;
      return { gridColumn: `${startColumn} / span 2` };
    }
    return { gridColumn: "span 2" };
  };
  const onlineOtherParticipants = otherParticipants.filter((participant) =>
    online.has(participant._id),
  );
  const availableMembers = memberResults.filter(
    (person) =>
      !currentConversation?.participants.some(
        (participant) => participant._id === person._id,
      ),
  );
  const viewerItem = viewerItems[viewerIndex];
  return (
    <>
      {!user || resetToken ? (
        <AuthScreen
          token={token}
          resetToken={resetToken}
          onPasswordReset={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("resetToken");
            window.history.replaceState(
              {},
              "",
              `${url.pathname}${url.search}${url.hash}`,
            );
            setResetToken(null);
          }}
          onAuthenticated={({ token: nextToken, user: nextUser }) => {
            sessionStorage.setItem("chat-token", nextToken);
            setToken(nextToken);
            setUser(nextUser);
          }}
        />
      ) : (
        <main
          id="chat-app"
          className={`app-shell${currentConversation ? " chat-open" : ""}`}
        >
          <aside className="sidebar">
            <div className="sidebar-head">
              <div className="brand">
                <img className="brand-mark" src="/nook-logo.svg" alt="" />
                <span>NOOK</span>
              </div>
              <div className="sidebar-tools">
                <details className="theme-menu">
                  <summary
                    className="icon-button"
                    aria-label="Choose color theme"
                    title="Appearance"
                    onClick={(event) => setThemeOrigin(event.currentTarget)}
                  >
                    <Icon name="sun" />
                  </summary>
                  <div
                    className="theme-popover"
                    role="radiogroup"
                    aria-label="Color theme"
                  >
                    <span className="theme-popover-title">Appearance</span>
                    {["system", "light", "dark"].map((option) => (
                      <label className="theme-option" key={option}>
                        <input
                          type="radio"
                          name="appearance"
                          value={option}
                          checked={theme === option}
                          onChange={() => setTheme(option)}
                        />
                        <span>{option[0].toUpperCase() + option.slice(1)}</span>
                      </label>
                    ))}
                  </div>
                </details>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Create group chat"
                  title="Create group chat"
                  onClick={openCreateGroup}
                >
                  <Icon name="group" />
                </button>
              </div>
            </div>
            <div className="identity">
              <Avatar name={user.username} />
              <div className="identity-copy">
                <strong>{user.username}</strong>
                <span>Available to chat</span>
              </div>
            </div>
            <div
              className="search-wrap"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setSearchOpen(false);
              }}
            >
              <Icon name="search" className="search-icon" />
              <input
                className="search-input"
                type="search"
                placeholder="Find people"
                autoComplete="off"
                aria-label="Find people"
                value={search}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchOpen(true);
                }}
              />
              {searchOpen && search.trim().length >= 2 && (
                <div className="search-results">
                  {searchResults.length ? (
                    searchResults.map((person) => (
                      <button
                        type="button"
                        className="search-result"
                        key={person._id}
                        onClick={() => startDirectConversation(person)}
                      >
                        <Avatar
                          name={person.username}
                          small
                          online={online.has(person._id)}
                        />
                        <strong>{person.username}</strong>
                      </button>
                    ))
                  ) : (
                    <div className="search-result">No people found</div>
                  )}
                </div>
              )}
            </div>
            <div className="section-label">
              <span>Messages</span>
              <span>{conversations.length || ""}</span>
            </div>
            <div className="conversation-list">
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation._id}
                  conversation={conversation}
                  user={user}
                  active={currentConversation?._id === conversation._id}
                  online={online}
                  onOpen={() => openConversation(conversation)}
                  onHide={() => hideConversation(conversation._id)}
                  onLeave={() => leaveGroup(conversation)}
                />
              ))}
            </div>
            <footer className="sidebar-foot">
              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                Signed in as <strong>{user.username}</strong>
              </span>
              <button className="text-button" type="button" onClick={logout}>
                Sign out
              </button>
            </footer>
          </aside>
          <section className="chat-pane">
            {currentConversation ? (
              <header className="chat-header">
                <button
                  className="icon-button back-button"
                  type="button"
                  aria-label="Back to conversations"
                  onClick={() => setCurrentConversation(null)}
                >
                  <Icon name="back" />
                </button>
                <Avatar name={headerName} small online={headerOnline} />
                <div className="chat-header-copy">
                  <h2>{headerName}</h2>
                  <p>
                    {currentConversation.type === "group"
                      ? `${currentConversation.participants.length} participants`
                      : headerOnline
                        ? "Online"
                        : "Direct conversation"}
                  </p>
                </div>
                {currentConversation.type === "direct" && (
                  <button
                    className="icon-button call-start-button"
                    type="button"
                    aria-label={`Video call ${headerName}`}
                    title={headerOnline ? "Start video call" : "User is offline"}
                    disabled={!headerOnline || Boolean(call)}
                    onClick={startCall}
                  >
                    <Icon name="video" />
                  </button>
                )}
                {currentConversation.type === "group" && (
                  <>
                    <button
                      className="icon-button call-start-button"
                      type="button"
                      aria-label={`Start group video call with ${headerName}`}
                      title={
                        onlineOtherParticipants.length
                          ? "Start group video call"
                          : "No other members are online"
                      }
                      disabled={!onlineOtherParticipants.length || Boolean(call)}
                      onClick={startCall}
                    >
                      <Icon name="video" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="View group details"
                      title="Group details"
                      onClick={openGroupDetails}
                    >
                      <Icon name="info" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Add people to group"
                      title="Add people to group"
                      onClick={openAddMembers}
                    >
                      <Icon name="group" />
                    </button>
                  </>
                )}
              </header>
            ) : (
              <div className="empty-state">
                <div className="empty-symbol">C</div>
                <h2>Your conversations live here</h2>
                <p>
                  Find someone by name to start a conversation. Messages arrive
                  instantly while you’re here.
                </p>
              </div>
            )}
            {currentConversation && (
              <>
                <div className="messages" aria-live="polite" ref={messagesRef}>
                  {messages.map((message) => (
                    <MessageRow
                      key={message._id}
                      message={message}
                      user={user}
                      onDelete={deleteMessage}
                      onOpenMedia={openViewer}
                      onDownload={downloadMedia}
                      onReact={toggleReaction}
                      onCallAgain={startCall}
                      canCallAgain={
                        (headerOnline || onlineOtherParticipants.length > 0) &&
                        !call
                      }
                    />
                  ))}
                </div>
                <div className="typing">{typingUser}</div>
                <div className="composer-wrap">
                  {!!mediaFiles.length && (
                    <div
                      className="media-preview"
                      aria-label="Selected attachments"
                    >
                      {mediaFiles.map((item, index) => (
                        <div
                          className="media-preview-item"
                          key={item.previewUrl}
                          title={item.file.name}
                        >
                          {item.file.type.startsWith("video/") ? (
                            <video
                              className="media-preview-thumb"
                              src={item.previewUrl}
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <img
                              className="media-preview-thumb"
                              src={item.previewUrl}
                              alt={item.file.name}
                            />
                          )}
                          <button
                            className="media-preview-remove"
                            type="button"
                            aria-label={`Remove ${item.file.name}`}
                            onClick={() => {
                              URL.revokeObjectURL(item.previewUrl);
                              setMediaFiles((files) =>
                                files.filter(
                                  (_, fileIndex) => fileIndex !== index,
                                ),
                              );
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <form className="composer" onSubmit={sendMessage}>
                    <button
                      className="icon-button media-attach"
                      type="button"
                      aria-label="Attach image or video"
                      title="Attach image or video"
                      onClick={() =>
                        document.getElementById("media-input").click()
                      }
                    >
                      <Icon name="attach" />
                    </button>
                    <input
                      className="hidden"
                      id="media-input"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime"
                      aria-label="Choose an image or video"
                      onChange={onSelectFiles}
                    />
                    <textarea
                      ref={messageInputRef}
                      rows="1"
                      maxLength="10000"
                      placeholder="Write a message..."
                      autoComplete="off"
                      aria-label="Message"
                      value={messageText}
                      onChange={(event) =>
                        handleMessageInput(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          event.currentTarget.form.requestSubmit();
                        }
                      }}
                    />
                    <button
                      className="primary"
                      type="submit"
                      disabled={
                        sending || (!messageText.trim() && !mediaFiles.length)
                      }
                    >
                      {sending ? "Sending..." : "Send"}
                    </button>
                  </form>
                </div>
              </>
            )}
          </section>
        </main>
      )}

      <Dialog
        className="group-dialog"
        open={dialog === "create"}
        onClose={() => setDialog(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDialog(null);
        }}
        aria-labelledby="group-dialog-title"
      >
        <form className="group-form" onSubmit={createGroup}>
          <div className="group-dialog-header">
            <div>
              <span className="eyebrow">Messages</span>
              <h2 id="group-dialog-title">New group chat</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close"
              onClick={() => setDialog(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          <label className="field">
            Group name
            <input
              value={groupName}
              maxLength="60"
              required
              placeholder="Name this group"
              onChange={(event) => setGroupName(event.target.value)}
            />
          </label>
          <label className="field">
            Add people
            <input
              type="search"
              value={groupSearch}
              placeholder="Search by name or email"
              autoComplete="off"
              onChange={(event) => setGroupSearch(event.target.value)}
            />
          </label>
          <SelectedPeople
            people={selectedGroup}
            onRemove={(id) =>
              setSelectedGroup((people) =>
                people.filter((person) => person._id !== id),
              )
            }
          />
          <div className="group-results" aria-label="People search results">
            <PersonResults
              people={groupResults}
              online={online}
              selected={new Set(selectedGroup.map((person) => person._id))}
              onToggle={(person) =>
                togglePerson(setSelectedGroup, selectedGroup, person)
              }
              emptyText={
                groupSearch.trim().length >= 2
                  ? "No people found"
                  : "Search by name or email to add people"
              }
            />
          </div>
          <p className="group-hint">
            {selectedGroup.length} selected. Choose at least two people to start
            a group.
          </p>
          <div className="group-dialog-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => setDialog(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              type="submit"
              disabled={selectedGroup.length < 2}
            >
              Create group
            </button>
          </div>
          <p className="notice" role="status">
            {dialogNotice}
          </p>
        </form>
      </Dialog>

      <Dialog
        className="group-dialog"
        open={dialog === "members"}
        onClose={() => setDialog(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDialog(null);
        }}
        aria-labelledby="add-members-title"
      >
        <form className="group-form" onSubmit={addMembers}>
          <div className="group-dialog-header">
            <div>
              <span className="eyebrow">
                {currentConversation?.name || "Group chat"}
              </span>
              <h2 id="add-members-title">Add people</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close"
              onClick={() => setDialog(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          <label className="field">
            Search people
            <input
              type="search"
              value={memberSearch}
              placeholder="Search by name or email"
              autoComplete="off"
              onChange={(event) => setMemberSearch(event.target.value)}
            />
          </label>
          <SelectedPeople
            people={selectedMembers}
            onRemove={(id) =>
              setSelectedMembers((people) =>
                people.filter((person) => person._id !== id),
              )
            }
          />
          <div className="group-results" aria-label="People search results">
            <PersonResults
              people={availableMembers}
              online={online}
              selected={new Set(selectedMembers.map((person) => person._id))}
              onToggle={(person) =>
                togglePerson(setSelectedMembers, selectedMembers, person)
              }
              emptyText={
                memberSearch.trim().length >= 2
                  ? "No new people found"
                  : "Search by name or email to add people"
              }
            />
          </div>
          <p className="group-hint">
            {selectedMembers.length
              ? `${selectedMembers.length} selected. Choose one or more people to add.`
              : "Choose one or more people to add."}
          </p>
          <div className="group-dialog-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => setDialog(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              type="submit"
              disabled={!selectedMembers.length}
            >
              Add to group
            </button>
          </div>
          <p className="notice" role="status">
            {dialogNotice}
          </p>
        </form>
      </Dialog>

      <Dialog
        className="group-dialog"
        open={dialog === "details"}
        onClose={() => setDialog(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDialog(null);
        }}
        aria-labelledby="group-details-title"
      >
        <form className="group-form" onSubmit={saveGroupName}>
          <div className="group-dialog-header">
            <div>
              <span className="eyebrow">Group chat</span>
              <h2 id="group-details-title">Group details</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close"
              onClick={() => setDialog(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          <label className="field">
            Group name
            <input
              value={detailsName}
              maxLength="60"
              required
              onChange={(event) => setDetailsName(event.target.value)}
            />
          </label>
          <div className="group-members-heading">
            <strong>People</strong>
            <span>{currentConversation?.participants.length}</span>
          </div>
          <div className="group-participants" aria-label="Group members">
            {currentConversation?.participants.map((person) => (
              <div className="group-person-row" key={person._id}>
                <Avatar
                  name={person.username}
                  online={online.has(person._id)}
                />
                <span className="group-person-name">{person.username}</span>
                <span className="group-person-state">
                  {person._id === user?.id
                    ? "You"
                    : online.has(person._id)
                      ? "Online"
                      : ""}
                </span>
                {person._id !== user?.id && (
                  <button
                    className="group-kick-button"
                    type="button"
                    onClick={() => kickMember(person)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="group-dialog-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => setDialog(null)}
            >
              Close
            </button>
            <button className="primary" type="submit">
              Save name
            </button>
          </div>
          <p className="notice" role="status">
            {dialogNotice}
          </p>
        </form>
      </Dialog>
      {viewerItem && (
        <div
          className="media-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Media viewer"
        >
          <div className="media-viewer-background" onClick={closeViewer}>
            {viewerItem.type === "video" ? (
              <video
                className="media-viewer-background-asset"
                src={viewerItem.url}
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img
                className="media-viewer-background-asset"
                src={viewerItem.url}
                alt=""
              />
            )}
          </div>
          <div className="media-viewer-toolbar">
            <span className="media-viewer-counter">
              {viewerIndex + 1} / {viewerItems.length}
            </span>
            <div className="media-viewer-actions">
              <button
                className="media-viewer-action"
                type="button"
                aria-label="Download media"
                title="Download"
                onClick={() =>
                  downloadMedia(viewerItem.messageId, viewerItem.mediaIndex)
                }
              >
                <Icon name="download" />
              </button>
              <button
                className="media-viewer-action"
                type="button"
                aria-label="Share media link"
                title="Share"
                onClick={async () => {
                  try {
                    if (navigator.share)
                      await navigator.share({
                        title: "Shared media",
                        url: viewerItem.url,
                      });
                    else await navigator.clipboard.writeText(viewerItem.url);
                  } catch (reason) {
                    if (reason.name !== "AbortError")
                      showError("Could not share media link");
                  }
                }}
              >
                <Icon name="share" />
              </button>
              <button
                className="media-viewer-action"
                type="button"
                aria-label="Close media viewer"
                title="Close"
                onClick={closeViewer}
              >
                <Icon name="close" />
              </button>
            </div>
          </div>
          <button
            className="media-viewer-nav media-viewer-previous"
            type="button"
            aria-label="Previous media"
            disabled={viewerItems.length < 2}
            onClick={() => moveViewer(-1)}
          >
            <Icon name="back" />
          </button>
          <div className="media-viewer-content">
            {viewerItem.type === "video" ? (
              <video
                className="media-viewer-asset"
                src={viewerItem.url}
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img
                className="media-viewer-asset"
                src={viewerItem.url}
                alt="Expanded shared image"
              />
            )}
          </div>
          <button
            className="media-viewer-nav media-viewer-next"
            type="button"
            aria-label="Next media"
            disabled={viewerItems.length < 2}
            onClick={() => moveViewer(1)}
          >
            <Icon name="next" />
          </button>
          <div
            className="media-viewer-thumbnails"
            aria-label="Conversation media"
          >
            {viewerItems.map((item, index) => (
              <button
                className={`media-viewer-thumbnail${index === viewerIndex ? " active" : ""}`}
                key={`${item.url}-${index}`}
                type="button"
                aria-label={`View media ${index + 1}`}
                aria-current={index === viewerIndex}
                onClick={() => setViewerIndex(index)}
              >
                {item.type === "video" ? (
                  <>
                    <video
                      className="media-viewer-thumbnail-asset"
                      src={item.url}
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <span className="media-viewer-video-mark">Video</span>
                  </>
                ) : (
                  <img
                    className="media-viewer-thumbnail-asset"
                    src={item.url}
                    alt=""
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        className="message-toast-region"
        aria-live="polite"
        aria-atomic="true"
      >
        {notification && (
          <button
            className="message-toast"
            type="button"
            onClick={async () => {
              const pending = notification;
              setNotification(null);
              try {
                const items = await fetchConversations(token);
                setConversations(items);
                const conversation = items.find(
                  (item) => item._id === pending.conversationId,
                );
                if (conversation) openConversation(conversation);
              } catch (reason) {
                showError(reason.message);
              }
            }}
          >
            <span className="message-toast-mark">
              <Icon name="chat" />
            </span>
            <span className="message-toast-copy">
              <strong>{notification.sender}</strong>
              <span>{notification.content}</span>
            </span>
            <span className="message-toast-action">Open</span>
          </button>
        )}
      </div>
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
      {call && (
        <section
          className={`call-overlay${call.status === "incoming" ? " is-incoming" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Video call"
        >
          <header
            className={`call-topbar${callChromeVisible ? "" : " call-chrome-hidden"}`}
          >
            <div className="call-topbar-copy">
              <strong>{call.peerName}</strong>
              <span>
                {call.status === "incoming"
                  ? `${call.caller?.username || "Someone"} is calling`
                  : call.status === "calling"
                    ? "Calling..."
                    : call.status === "connected"
                      ? `${call.members.length} in call`
                      : "Connecting..."}
              </span>
            </div>
            <button
              className="call-icon-button"
              type="button"
              aria-label="End call"
              title="End call"
              onClick={endCall}
            >
              <Icon name="close" />
            </button>
          </header>
          <div className="call-stage">
            {call.status === "incoming" ? (
              <div className="call-incoming-stage">
                {call.caller?.avatarUrl ? (
                  <img
                    className="call-incoming-avatar"
                    src={call.caller.avatarUrl}
                    alt=""
                  />
                ) : (
                  <Avatar name={call.caller?.username || call.peerName} />
                )}
                <strong>{call.caller?.username || call.peerName}</strong>
                <span>
                  {call.isGroup
                    ? `Inviting you to ${call.conversationName || "a group"}`
                    : "Incoming video call"}
                </span>
              </div>
            ) : (
              <div
                className={`call-participant-grid${call.isGroup ? " is-group-call" : ""}${twoPersonGroupPip ? " is-two-person-call" : ""}${desktopDirectCall ? " is-direct-desktop" : ""}`}
                style={
                  call.isGroup
                    ? {
                        "--call-grid-tracks": groupCallColumns * 2,
                        "--call-grid-rows": groupCallRows,
                        width:
                          callViewport.width <= 720 || twoPersonGroupPip
                            ? "100%"
                            : `${groupCallGridWidth}px`,
                      }
                    : desktopDirectCall
                      ? { width: "min(100%, 1440px)" }
                    : undefined
                }
              >
                {((call.isGroup && !twoPersonGroupPip) || desktopDirectCall) && (
                  <div
                    className="call-participant-tile"
                    key={user.id}
                    style={call.isGroup ? groupCallTileStyle(0) : undefined}
                  >
                    {call.localStream && !call.cameraOff ? (
                      <video
                        className="call-participant-video call-self-video"
                        ref={desktopDirectCall ? desktopLocalVideoRef : localVideoRef}
                        autoPlay
                        muted
                        playsInline
                      />
                    ) : user.avatarUrl ? (
                      <img
                        className="call-participant-avatar"
                        src={user.avatarUrl}
                        alt=""
                      />
                    ) : (
                      <Avatar name={user.username} />
                    )}
                    <span className="call-participant-name">You</span>
                    {call.cameraOff && (
                      <span className="call-camera-off">Camera off</span>
                    )}
                  </div>
                )}
                {call.members
                  .filter((member) => member.id !== user.id)
                  .map((member, index) => {
                    const peer = call.peers.find(
                      (item) => item.id === member.id,
                    );
                    return (
                      <div
                        className="call-participant-tile"
                        key={member.id}
                        style={
                          call.isGroup
                            ? groupCallTileStyle(index + 1)
                            : undefined
                        }
                      >
                        {peer?.stream ? (
                          <video
                            className="call-participant-video"
                            ref={(element) => {
                              if (element)
                                peerVideoRefs.current.set(member.id, element);
                              else peerVideoRefs.current.delete(member.id);
                            }}
                            autoPlay
                            playsInline
                          />
                        ) : member.avatarUrl ? (
                          <img
                            className="call-participant-avatar"
                            src={member.avatarUrl}
                            alt=""
                          />
                        ) : (
                          <Avatar name={member.username} />
                        )}
                        <span className="call-participant-name">
                          {member.username}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
            {call.localStream &&
              ((!call.isGroup && !desktopDirectCall) || twoPersonGroupPip) && (
              <div className="call-local-tile">
                <video
                  className="call-local-video"
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                />
                {call.cameraOff && <span>Camera off</span>}
              </div>
            )}
          </div>
          <footer
            className={`call-controls${callChromeVisible ? "" : " call-chrome-hidden"}`}
          >
            {call.status === "incoming" ? (
              <>
                <button
                  className="call-control-button call-decline"
                  type="button"
                  aria-label="Decline call"
                  title="Decline"
                  onClick={rejectCall}
                >
                  <Icon name="phone" />
                </button>
                <button
                  className="call-control-button call-accept"
                  type="button"
                  aria-label="Accept video call"
                  title="Accept"
                  onClick={acceptCall}
                >
                  <Icon name="video" />
                </button>
              </>
            ) : (
              <>
                <button
                  className={`call-control-button${call.muted ? " is-off" : ""}`}
                  type="button"
                  aria-label={call.muted ? "Unmute microphone" : "Mute microphone"}
                  title={call.muted ? "Unmute microphone" : "Mute microphone"}
                  onClick={toggleCallAudio}
                >
                  <Icon name={call.muted ? "micOff" : "microphone"} />
                </button>
                <button
                  className={`call-control-button${call.cameraOff ? " is-off" : ""}`}
                  type="button"
                  aria-label={call.cameraOff ? "Turn camera on" : "Turn camera off"}
                  title={call.cameraOff ? "Turn camera on" : "Turn camera off"}
                  onClick={toggleCallVideo}
                >
                  <Icon name={call.cameraOff ? "cameraOff" : "video"} />
                </button>
                <button
                  className="call-control-button call-decline"
                  type="button"
                  aria-label={call.callerId === user.id ? "End call for everyone" : "Leave call"}
                  title={call.callerId === user.id ? "End call" : "Leave call"}
                  onClick={endCall}
                >
                  <Icon name="phone" />
                </button>
              </>
            )}
          </footer>
        </section>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
