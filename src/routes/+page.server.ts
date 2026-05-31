import type { Actions } from './$types';
import { config, getGraphQLHeaders } from '$lib/config';

const SEND_SINGLE_SMS_MUTATION = `
  mutation SendSingleSms($data: String!) {
    send_single_sms(data: $data) {
      message
      status_code
    }
  }
`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildContactMessage(input: {
  fullName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}) {
  const subjectLine = input.subject ? input.subject : 'General inquiry';
  return [
    'New BamanStock contact request',
    '',
    `Name: ${input.fullName}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone}`,
    `Subject: ${subjectLine}`,
    '',
    'Message:',
    input.message,
  ].join('\n');
}

async function sendSingleSms(content: string) {
  const response = await fetch(config.graphql.endpoint, {
    method: 'POST',
    headers: getGraphQLHeaders(),
    body: JSON.stringify({
      query: SEND_SINGLE_SMS_MUTATION,
      variables: {
        data: content,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data?.send_single_sms as { message: string; status_code: number } | null;
}

export const actions: Actions = {
  sendContactMessage: async ({ request }) => {
    const formData = await request.formData();

    const fullName = (formData.get('full_name') as string | null)?.trim() ?? '';
    const email = (formData.get('email') as string | null)?.trim() ?? '';
    const phone = (formData.get('phone') as string | null)?.trim() ?? '';
    const subject = (formData.get('subject') as string | null)?.trim() ?? '';
    const message = (formData.get('message') as string | null)?.trim() ?? '';

    const values = { fullName, email, phone, subject, message };

    const fieldErrors: Record<string, string> = {};
    if (!fullName) fieldErrors.fullName = 'Please enter your full name.';
    if (!email) {
      fieldErrors.email = 'Please enter your email address.';
    } else if (!EMAIL_PATTERN.test(email)) {
      fieldErrors.email = 'Please enter a valid email address.';
    }
    if (!phone) fieldErrors.phone = 'Please enter your phone number.';
    if (!message) fieldErrors.message = 'Please enter your message.';

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        message: 'Please correct the highlighted fields.',
        fieldErrors,
        values,
      };
    }

    try {
      const content = buildContactMessage({ fullName, email, phone, subject, message });
      const smsResult = await sendSingleSms(content);

      if (smsResult && smsResult.status_code >= 400) {
        return {
          success: false,
          message: smsResult.message || 'We could not send your message. Please try again.',
          values,
        };
      }

      return {
        success: true,
        message: "Thanks for reaching out! Your message has been sent — we'll get back to you soon.",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send your message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        values,
      };
    }
  },
};
