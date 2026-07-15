import OpenAI from "openai";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { setCurrentCompany } from "@/lib/tenant-context";
import { chat, createNewConversation } from "@/lib/ai/engine";
import { resolveCustomer } from "@/lib/customer-resolver";

interface PhoneConfig {
  twilioSid: string;
  twilioToken: string;
  twilioPhone: string;
  elevenLabsKey: string;
  elevenLabsVoice: string;
  aiApiKey: string;
}

async function getPhoneConfig(companyId: string): Promise<PhoneConfig | null> {
  const settings = await prismaUnscoped.settings.findUnique({ where: { companyId } });
  if (!settings?.twilioSid || !settings?.twilioToken) return null;

  return {
    twilioSid: settings.twilioSid,
    twilioToken: settings.twilioToken,
    twilioPhone: settings.twilioPhone,
    elevenLabsKey: settings.elevenLabsKey,
    elevenLabsVoice: settings.elevenLabsVoice,
    aiApiKey: settings.aiApiKey,
  };
}

/**
 * Twilio webhooks carry no session — the company that owns this call is
 * resolved from which company's Settings row has this Twilio number configured.
 */
async function resolvePhoneCompanyId(toNumber: string): Promise<string | null> {
  if (!toNumber) return null;
  const settings = await prismaUnscoped.settings.findFirst({
    where: { twilioPhone: toNumber },
    select: { companyId: true },
  });
  return settings?.companyId || null;
}

// Speech-to-Text using OpenAI Whisper
export async function transcribeAudio(
  audioBuffer: Buffer,
  apiKey: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const file = new File([new Uint8Array(audioBuffer)], "audio.wav", { type: "audio/wav" });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });

  return transcription.text;
}

// Text-to-Speech using ElevenLabs
export async function synthesizeSpeech(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Generate TwiML response for incoming calls
export function generateTwiMLGather(
  message: string,
  callbackUrl: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message)}</Say>
  <Gather input="speech" action="${callbackUrl}" method="POST" speechTimeout="auto" language="auto">
    <Say voice="alice">I'm listening.</Say>
  </Gather>
  <Say voice="alice">I didn't hear anything. Goodbye.</Say>
</Response>`;
}

export function generateTwiMLSay(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message)}</Say>
  <Gather input="speech" action="/api/channels/phone/gather" method="POST" speechTimeout="auto" language="auto">
    <Say voice="alice">Is there anything else I can help with?</Say>
  </Gather>
  <Say voice="alice">Thank you for calling. Goodbye.</Say>
</Response>`;
}

export function generateTwiMLStream(websocketUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${websocketUrl}" />
  </Connect>
</Response>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Handle incoming call
export async function handleIncomingCall(
  from: string,
  callSid: string,
  to: string
): Promise<string> {
  const companyId = await resolvePhoneCompanyId(to);
  if (!companyId) {
    return generateTwiMLSay(
      "Sorry, the phone system is not properly configured. Please try again later."
    );
  }
  setCurrentCompany(companyId);

  const config = await getPhoneConfig(companyId);
  if (!config) {
    return generateTwiMLSay(
      "Sorry, the phone system is not properly configured. Please try again later."
    );
  }

  // Create call log
  await prisma.callLog.create({
    data: {
      companyId,
      callSid,
      from,
      to: config.twilioPhone,
      status: "in-progress",
    },
  });

  // Resolve customer identity across channels
  const customerId = await resolveCustomer("phone", from, "Phone Caller");

  // Create or find conversation
  let conversation = await prisma.conversation.findFirst({
    where: {
      channel: "phone",
      status: { in: ["active", "escalated"] },
      OR: [
        { customerId },
        { customerContact: from },
      ],
    },
  });

  if (!conversation) {
    conversation = await createNewConversation("phone", "Phone Caller", from, customerId);
  }

  const settings = await prisma.settings.findFirst();
  const welcomeMessage =
    settings?.welcomeMessage || "Hello! How can I help you today?";

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/phone/gather?conversationId=${conversation.id}&callSid=${callSid}`;

  return generateTwiMLGather(welcomeMessage, callbackUrl);
}

// Handle speech input during call
export async function handleSpeechInput(
  speechResult: string,
  conversationId: string,
  callSid: string
): Promise<string> {
  if (!speechResult || speechResult.trim() === "") {
    return generateTwiMLSay("I didn't catch that. Could you please repeat?");
  }

  const conversation = await prismaUnscoped.conversation.findUnique({
    where: { id: conversationId },
    select: { companyId: true },
  });
  if (!conversation) {
    return generateTwiMLSay("Sorry, this call could not be found. Please try again later.");
  }
  setCurrentCompany(conversation.companyId);

  // Get AI response
  let aiResponse: string;
  try {
    aiResponse = await chat(conversationId, speechResult);
  } catch {
    return generateTwiMLSay("I'm sorry, I'm having trouble right now. Please try again or hold for an agent.");
  }

  // Update call log
  await prisma.callLog.updateMany({
    where: { callSid },
    data: { status: "in-progress" },
  });

  return generateTwiMLSay(aiResponse);
}

// End call handler
export async function handleCallEnd(callSid: string, duration: number) {
  await prismaUnscoped.callLog.updateMany({
    where: { callSid },
    data: {
      status: "completed",
      duration,
    },
  });
}

export function getPhoneStatus() {
  return {
    configured: false,
    status: "disconnected" as const,
  };
}
