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

const sendIncomingMessageEmail = async ({
  senderName,
  recipientIds,
  content,
  conversationName,
}) => {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return { ok: false, reason: "No recipients" };
  }

  if (!isEmailNotificationsEnabled()) {
    return { ok: false, reason: "Email notifications are not configured" };
  }

  const recipients = await User.find({ _id: { $in: recipientIds } }).select(
    "email username",
  );
  if (!recipients.length) {
    return { ok: false, reason: "No recipient emails found" };
  }

  const transporter = buildEmailTransport();
  if (!transporter) {
    return { ok: false, reason: "SMTP transport unavailable" };
  }

  const fromAddress =
    process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER;
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

const scheduleIncomingMessageEmail = ({
  messageId,
  senderName,
  recipientIds,
  content,
  conversationName,
}) => {
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
        const mediaPreview =
          attachedMedia.length > 1
            ? `Sent ${attachedMedia.length} attachments`
            : attachedMedia[0]?.type === "video" ||
                unreadMessage.mediaType === "video"
              ? "Sent a video"
              : attachedMedia[0]?.type === "image" ||
                  unreadMessage.mediaType === "image"
                ? "Sent an image"
                : content;
        const notificationContent = unreadMessage.content || mediaPreview;

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

const isPasswordResetEmailConfigured = () => {
  const { username, password } = getEmailConfig();
  return Boolean(process.env.SMTP_HOST && username && password);
};

const buildPasswordEmailTransport = () => {
  if (!isPasswordResetEmailConfigured()) return null;
  const { username, password } = getEmailConfig();
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: username, pass: password },
  });
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const sendPasswordResetEmail = async ({ email, username, resetUrl }) => {
  const transporter = buildPasswordEmailTransport();
  if (!transporter) throw new Error("Password reset email is not configured");
  const { username: emailUser } = getEmailConfig();
  const displayName = username || "there";
  const safeName = escapeHtml(displayName);
  const safeResetUrl = escapeHtml(resetUrl);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || emailUser,
    to: email,
    subject: "Reset your Real-Time Chat password",
    text: [
      `Hi ${displayName},`,
      "",
      "Use the link below to choose a new password. It expires in 30 minutes and can only be used once.",
      resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <!doctype html>
      <html lang="en">
        <body style="margin:0;padding:0;background:#eef3ef;font-family:Arial,Helvetica,sans-serif;color:#1d2a25;">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Use this one-time link to reset your Real-Time Chat password.</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3ef;padding:32px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe8e1;border-radius:10px;overflow:hidden;">
                  <tr>
                    <td style="padding:24px 32px;background:#1e4439;color:#f4f8f5;">
                      <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;color:#bfe3ce;">REAL-TIME CHAT</div>
                      <div style="margin-top:5px;font-size:19px;line-height:26px;font-weight:700;">Account security</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:34px 32px 18px;">
                      <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1d715c;">Password reset</div>
                      <h1 style="margin:8px 0 16px;font-size:26px;line-height:34px;color:#1d2a25;">Choose a new password</h1>
                      <p style="margin:0 0 14px;font-size:16px;line-height:25px;">Hi ${safeName},</p>
                      <p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#53635a;">We received a request to reset your password. Use the button below to continue.</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                        <tr>
                          <td align="center" style="border-radius:6px;background:#1d715c;">
                            <a href="${safeResetUrl}" style="display:inline-block;padding:13px 22px;border:1px solid #1d715c;border-radius:6px;color:#ffffff;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;">Reset password</a>
                          </td>
                        </tr>
                      </table>
                      <div style="padding:14px 16px;border-left:3px solid #1d715c;background:#f2f7f3;color:#53635a;font-size:13px;line-height:21px;">
                        This link expires in <strong style="color:#1d2a25;">30 minutes</strong> and can only be used once.
                      </div>
                      <p style="margin:22px 0 6px;font-size:13px;line-height:20px;color:#78857e;">If the button does not work, copy this link into your browser:</p>
                      <p style="margin:0 0 20px;overflow-wrap:anywhere;font-size:12px;line-height:19px;"><a href="${safeResetUrl}" style="color:#1d715c;">${safeResetUrl}</a></p>
                      <p style="margin:0 0 26px;font-size:13px;line-height:21px;color:#78857e;">If you did not request a password reset, you can ignore this email. Your password will not change.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 32px;border-top:1px solid #e7ece7;color:#89958e;font-size:11px;line-height:18px;">This is an automated account security message from Real-Time Chat.</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });
};

const sendPasswordChangedEmail = async ({ email, username }) => {
  const transporter = buildPasswordEmailTransport();
  if (!transporter) throw new Error("Password reset email is not configured");
  const { username: emailUser } = getEmailConfig();
  const displayName = username || "there";
  const safeName = escapeHtml(displayName);
  const changedAt = new Date().toUTCString();
  const safeChangedAt = escapeHtml(changedAt);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || emailUser,
    to: email,
    subject: "Your Real-Time Chat password was changed",
    text: [
      `Hi ${displayName},`,
      "",
      `Your Real-Time Chat password was changed on ${changedAt}.`,
      "",
      "If you did not make this change, request another password reset and secure your email account.",
    ].join("\n"),
    html: `
      <!doctype html>
      <html lang="en">
        <body style="margin:0;padding:0;background:#eef3ef;font-family:Arial,Helvetica,sans-serif;color:#1d2a25;">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Real-Time Chat password was changed.</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3ef;padding:32px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe8e1;border-radius:10px;overflow:hidden;">
                  <tr>
                    <td style="padding:24px 32px;background:#1e4439;color:#f4f8f5;">
                      <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;color:#bfe3ce;">REAL-TIME CHAT</div>
                      <div style="margin-top:5px;font-size:19px;line-height:26px;font-weight:700;">Account security</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:34px 32px 18px;">
                      <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1d715c;">Password updated</div>
                      <h1 style="margin:8px 0 16px;font-size:26px;line-height:34px;color:#1d2a25;">Your password has been changed</h1>
                      <p style="margin:0 0 18px;font-size:16px;line-height:25px;">Hi ${safeName},</p>
                      <p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#53635a;">This email confirms that your Real-Time Chat account password was changed.</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f2f7f3;border:1px solid #dfe8e1;border-radius:7px;">
                        <tr>
                          <td style="padding:16px 18px;">
                            <div style="font-size:11px;line-height:17px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#78857e;">Change time</div>
                            <div style="margin-top:4px;font-size:14px;line-height:22px;font-weight:700;color:#1d2a25;">${safeChangedAt}</div>
                          </td>
                        </tr>
                      </table>
                      <div style="padding:14px 16px;border-left:3px solid #d87158;background:#fbf3f0;color:#53635a;font-size:13px;line-height:21px;">
                        <strong style="color:#1d2a25;">Wasn't you?</strong> Request another password reset and secure your email account.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 32px;border-top:1px solid #e7ece7;color:#89958e;font-size:11px;line-height:18px;">This is an automated account security message from Real-Time Chat.</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });
};

module.exports = {
  scheduleIncomingMessageEmail,
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
};
