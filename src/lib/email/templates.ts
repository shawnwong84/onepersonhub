const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function welcomeEmailHtml(companyName: string, adminName: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #18181b;">
      <p style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Welcome to Paperhuman, ${adminName}.</p>
      <p style="font-size: 15px; line-height: 1.6;">
        ${companyName} is set up and ready. Your workspace is isolated from every other company on Paperhuman,
        with your own channels, workflows, and team.
      </p>
      <p style="font-size: 15px; line-height: 1.6;">
        Log in any time to pick a plan and connect your first channel.
      </p>
      <p style="margin-top: 24px;">
        <a href="${APP_URL}/login" style="background: #F97316; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 999px; font-size: 14px; font-weight: 600;">
          Go to Paperhuman
        </a>
      </p>
      <p style="font-size: 13px; color: #71717a; margin-top: 32px;">hello@paperhuman.im</p>
    </div>
  `.trim();
}

export function demoRequestInternalEmailHtml(input: {
  name: string;
  email: string;
  company: string;
  message: string;
}): string {
  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const company = escapeHtml(input.company);
  const message = escapeHtml(input.message);
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #18181b;">
      <p style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">New demo request</p>
      <p style="font-size: 15px; line-height: 1.6;"><strong>Name:</strong> ${name}</p>
      <p style="font-size: 15px; line-height: 1.6;"><strong>Email:</strong> ${email}</p>
      <p style="font-size: 15px; line-height: 1.6;"><strong>Company:</strong> ${company}</p>
      ${message ? `<p style="font-size: 15px; line-height: 1.6;"><strong>Message:</strong><br />${message}</p>` : ""}
    </div>
  `.trim();
}

export function demoRequestThankYouEmailHtml(name: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #18181b;">
      <p style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Thanks for reaching out, ${escapeHtml(name)}.</p>
      <p style="font-size: 15px; line-height: 1.6;">
        We got your demo request and someone from the Paperhuman team will be in touch shortly to set up a time.
      </p>
      <p style="font-size: 13px; color: #71717a; margin-top: 32px;">hello@paperhuman.im</p>
    </div>
  `.trim();
}
