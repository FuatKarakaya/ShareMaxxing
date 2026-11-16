import nodemailer from 'nodemailer';

export type SendVerificationCode = (email: string, code: string) => Promise<void>;

export const sendVerificationCode: SendVerificationCode = async (email, code) => {
  const url = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM;
  if (!url || !from) throw new Error('Verification SMTP configuration is missing.');

  const endpoint = new URL(url);
  if (!['smtp:', 'smtps:'].includes(endpoint.protocol)) throw new Error('Invalid SMTP protocol.');
  const secure = endpoint.protocol === 'smtps:';
  const transport = nodemailer.createTransport({
    host: endpoint.hostname,
    port: Number(endpoint.port || (secure ? 465 : 587)),
    secure,
    requireTLS: process.env.NODE_ENV === 'production' && !secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    ...(endpoint.username ? { auth: { user: decodeURIComponent(endpoint.username), pass: decodeURIComponent(endpoint.password) } } : {}),
  }, { from });
  try {
    const result = await transport.sendMail({
      to: email,
      subject: 'ShareMaxxing e-posta doğrulama kodu',
      text: `Doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız mesajı yok sayabilirsiniz.`,
    });
    if (result.accepted.length === 0) throw new Error('SMTP did not accept the recipient.');
  } finally {
    transport.close();
  }
};
