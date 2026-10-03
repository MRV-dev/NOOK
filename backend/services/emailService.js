const nodemailer = require("nodemailer");
const Message = require("../models/message.model");
const User = require("../models/user.model");

const getEmailNotificationDelayMs = () => {
  const minutes = Number(process.env.EMAIL_NOTIFICATION_DELAY_MINUTES || 30);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 60
    ? minutes * 60 * 1000
    : 30 * 60 * 1000;
};

const getEmailConfig = () => {
  const username = process.env.EMAIL_USER || process.env.SMTP_USER;
  const password = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;
  return {
    username,
    password,
  };
};

const isEmailNotificationsEnabled = () => {
  const enabled = process.env.EMAIL_NOTIFICATION_ENABLED;
  if (enabled === "false") {
    return false;
  }

  const { username, password } = getEmailConfig();
  return Boolean(process.env.SMTP_HOST && username && password);
};

const buildEmailTransport = () => {
  if (!isEmailNotificationsEnabled()) {
    return null;
  }

  const { username, password } = getEmailConfig();

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: username,
      pass: password,
    },
  });
};

const sendIncomingMessageEmail = async ({ senderName, recipientIds, content, conversationName }) => {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return { ok: false, reason: "No recipients" };
  }

  if (!isEmailNotificationsEnabled()) {
    return { ok: false, reason: "Email notifications are not configured" };
  }

  const recipients = await User.find({ _id: { $in: recipientIds } }).select("email username");
  if (!recipients.length) {
    return { ok: false, reason: "No recipient emails found" };
  }

  const transporter = buildEmailTransport();
  if (!transporter) {
    return { ok: false, reason: "SMTP transport unavailable" };
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER;
  const groupLabel = conversationName ? ` in ${conversationName}` : "";
  const subject = `New message from ${senderName}`;

  const emailResults = [];

  for (const recipient of recipients) {
    if (!recipient.email) {
      continue;
    }

    const text = [
      `Hi ${recipient.username || "there"},`,
      "",
      `${senderName} has messaged you${groupLabel}.`,
      "",
      `Message: ${content}`,
      "",
      "Open the chat to reply.",
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">New message</h2>
        <p>Hi ${recipient.username || "there"},</p>
        <p><strong>${senderName}</strong> has messaged you${groupLabel}.</p>
        <div style="background: #f3f4f6; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 8px; margin: 16px 0;">
          <strong>Message:</strong><br>
          ${content}
        </div>
        <p>Open the chat to reply.</p>
      </div>
    `;

    await transporter.sendMail({
      from: fromAddress,
      to: recipient.email,
      subject,
      text,
      html,
    });

    emailResults.push(recipient.email);
  }

  return { ok: true, sent: emailResults.length, recipients: emailResults };
};

const scheduleIncomingMessageEmail = ({ messageId, senderName, recipientIds, content, conversationName }) => {
  const delayMs = getEmailNotificationDelayMs();

  recipientIds.forEach((recipientId) => {
    setTimeout(async () => {
      try {
        const unreadMessage = await Message.findOne({
          _id: messageId,
          readBy: { $ne: recipientId },
          isDeleted: { $ne: true },
        }).select("content mediaType media");
        if (!unreadMessage) {
          return;
        }

        const attachedMedia = unreadMessage.media || [];
        const mediaPreview = attachedMedia.length > 1
          ? `Sent ${attachedMedia.length} attachments`
          : attachedMedia[0]?.type === "video" || unreadMessage.mediaType === "video"
            ? "Sent a video"
            : attachedMedia[0]?.type === "image" || unreadMessage.mediaType === "image"
              ? "Sent an image"
              : content;
        const notificationContent = unreadMessage.content || (
          mediaPreview
        );

        await sendIncomingMessageEmail({
          senderName,
          recipientIds: [recipientId],
          content: notificationContent,
          conversationName,
        });
      } catch (error) {
        console.error("Could not send incoming message email:", error.message);
      }
    }, delayMs).unref?.();
  });
};

module.exports = { scheduleIncomingMessageEmail };
