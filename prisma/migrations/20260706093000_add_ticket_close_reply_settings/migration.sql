ALTER TABLE "Settings"
ADD COLUMN "ticketCloseAutoReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "ticketCloseReplyTemplate" TEXT NOT NULL DEFAULT 'Your ticket "{{ticketTitle}}" has been {{ticketStatus}}.

{{resolution}}

If you need more help, reply here and our support team will follow up.';
